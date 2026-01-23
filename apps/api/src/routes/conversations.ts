import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { z } from 'zod';
import { sendText } from '../whatsapp/client.js';
import { io } from '../server/socket.js';

const ALLOWED_CONVERSATION_STATES = ['BOT_ON', 'HUMAN_TAKEOVER'] as const;

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.get('/', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const state = (req.query.state as string | undefined)?.trim();
  const assigned = (req.query.assigned as string | undefined)?.trim();
  const leadStatus = (req.query.leadStatus as string | undefined)?.trim();

  const where: any = {};
  if (q) where.waFrom = { contains: q };
  if (state && (ALLOWED_CONVERSATION_STATES as readonly string[]).includes(state)) where.state = state;
  if (assigned === 'me') where.assignedUserId = (req as any).user.sub;
  if (assigned === 'unassigned') where.assignedUserId = null;
  if (leadStatus) where.leadStatus = leadStatus;

  const convos = await prisma.conversation.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
    include: {
      assignedUser: { select: { id: true, name: true } },
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: { id: true, sender: true, type: true, text: true, mediaUrl: true, timestamp: true, direction: true }
      }
    }
  });
  return res.json(
    convos.map((c: any) => ({
      ...c,
      lastMessage: c.messages?.[0] || null
    }))
  );
});

conversationsRouter.get('/:id', async (req, res) => {
  const convo = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: { assignedUser: { select: { id:true, name:true } } }
  });
  if (!convo) return res.status(404).json({ error: 'Not found' });
  return res.json(convo);
});

conversationsRouter.get('/:id/messages', async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    orderBy: { timestamp: 'asc' },
    take: 500
  });
  return res.json(messages);
});

conversationsRouter.get('/:id/events', async (req, res) => {
  const events = await prisma.conversationEvent.findMany({
    where: { conversationId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  return res.json(events);
});

conversationsRouter.post('/:id/takeover', async (req, res) => {
  const schema = z.object({ userId: z.string().optional(), note: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid payload' });

  const acting = (req as any).user;

  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id }});
  if (!convo) return res.status(404).json({ error:'Not found' });

  const userId = parsed.data.userId || acting.sub;

  await prisma.conversation.update({
    where: { id: convo.id },
    data: { state: 'HUMAN_TAKEOVER', assignedUserId: userId, leadStatus: 'HUMAN' }
  });

  await prisma.conversationEvent.create({
    data: { conversationId: convo.id, kind:'MANUAL_TAKEOVER', payload: { by: acting.sub, assignedTo: userId } }
  });

  if (parsed.data.note) {
    await prisma.note.create({ data: { conversationId: convo.id, userId: acting.sub, text: parsed.data.note } });
  }

  io.emit('conversation:updated', { conversationId: convo.id });
  return res.json({ ok: true });
});

conversationsRouter.post('/:id/return-to-bot', async (req, res) => {
  const acting = (req as any).user;
  const schema = z.object({ silent: z.boolean().optional().default(true) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid payload' });

  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id }});
  if (!convo) return res.status(404).json({ error:'Not found' });

  await prisma.conversation.update({
    where: { id: convo.id },
    data: { state: 'BOT_ON', assignedUserId: null }
  });

  await prisma.conversationEvent.create({
    data: { conversationId: convo.id, kind:'MANUAL_RETURN_TO_BOT', payload: { by: acting.sub } }
  });

  // Usually we keep it silent so the client doesn't notice.
  // If you want a visible message, set silent=false and customize here.
  if (!parsed.data.silent) {
    const txt = 'Listo, sigo por acá 🙌 ¿En qué te puedo ayudar?';
    await sendText({ to: convo.waFrom, text: txt, preview_url:false });
    await prisma.message.create({ data: { conversationId: convo.id, direction:'OUT', sender:'BOT', type:'TEXT', text: txt }});
  }

  io.emit('conversation:updated', { conversationId: convo.id });

  return res.json({ ok: true });
});

conversationsRouter.post('/:id/send', async (req, res) => {
  const acting = (req as any).user;
  const schema = z.object({ text: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid payload' });

  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id }});
  if (!convo) return res.status(404).json({ error:'Not found' });

  // When a human sends, we enforce HUMAN_TAKEOVER (silence bot)
  await prisma.conversation.update({
    where: { id: convo.id },
    data: { state: 'HUMAN_TAKEOVER', lastHumanMsgAt: new Date(), assignedUserId: convo.assignedUserId || acting.sub, leadStatus: 'HUMAN' }
  });

  await sendText({ to: convo.waFrom, text: parsed.data.text, preview_url: true });

  await prisma.message.create({
    data: { conversationId: convo.id, direction:'OUT', sender:'HUMAN', type:'TEXT', text: parsed.data.text }
  });

  await prisma.conversationEvent.create({
    data: { conversationId: convo.id, kind:'HUMAN_SENT_MESSAGE', payload: { by: acting.sub } }
  });

  io.emit('message:new', { conversationId: convo.id });
  io.emit('conversation:updated', { conversationId: convo.id });

  return res.json({ ok: true });
});

conversationsRouter.post('/:id/note', async (req, res) => {
  const acting = (req as any).user;
  const schema = z.object({ text: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid payload' });

  await prisma.note.create({ data: { conversationId: req.params.id, userId: acting.sub, text: parsed.data.text } });
  io.emit('conversation:updated', { conversationId: req.params.id });
  return res.json({ ok: true });
});

conversationsRouter.get('/:id/notes', async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { conversationId: req.params.id },
    include: { user: { select: { name:true, email:true } } },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  return res.json(notes);
});

// Pause bot for a conversation (keeps messages flowing to panel; bot stays silent)
conversationsRouter.post('/:id/pause-bot', async (req, res) => {
  const acting = (req as any).user;
  const schema = z.object({ minutes: z.number().int().min(1).max(60*24).default(60) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid payload' });

  const until = new Date(Date.now() + parsed.data.minutes * 60 * 1000);
  await prisma.conversation.update({ where: { id: req.params.id }, data: { botPausedUntil: until } });
  await prisma.conversationEvent.create({ data: { conversationId: req.params.id, kind:'BOT_PAUSED', payload: { by: acting.sub, minutes: parsed.data.minutes, until } } });
  io.emit('conversation:updated', { conversationId: req.params.id });
  return res.json({ ok:true, botPausedUntil: until });
});

conversationsRouter.post('/:id/resume-bot', async (req, res) => {
  const acting = (req as any).user;
  await prisma.conversation.update({ where: { id: req.params.id }, data: { botPausedUntil: null } });
  await prisma.conversationEvent.create({ data: { conversationId: req.params.id, kind:'BOT_RESUMED', payload: { by: acting.sub } } });
  io.emit('conversation:updated', { conversationId: req.params.id });
  return res.json({ ok:true });
});
