import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { z } from 'zod';
import { sendText } from '../whatsapp/client.js';

const ALLOWED_CONVERSATION_STATES = ['BOT_ON', 'HUMAN_TAKEOVER'] as const;

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.get('/', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const state = (req.query.state as string | undefined)?.trim();
  const assigned = (req.query.assigned as string | undefined)?.trim();

  const where: any = {};
  if (q) where.waFrom = { contains: q };
  if (state && (ALLOWED_CONVERSATION_STATES as readonly string[]).includes(state)) where.state = state;
  if (assigned === 'me') where.assignedUserId = (req as any).user.sub;

  const convos = await prisma.conversation.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
    include: { assignedUser: { select: { id:true, name:true } } }
  });
  return res.json(convos);
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
    data: { state: 'HUMAN_TAKEOVER', assignedUserId: userId }
  });

  await prisma.conversationEvent.create({
    data: { conversationId: convo.id, kind:'MANUAL_TAKEOVER', payload: { by: acting.sub, assignedTo: userId } }
  });

  if (parsed.data.note) {
    await prisma.note.create({ data: { conversationId: convo.id, userId: acting.sub, text: parsed.data.note } });
  }

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
    data: { state: 'HUMAN_TAKEOVER', lastHumanMsgAt: new Date(), assignedUserId: convo.assignedUserId || acting.sub }
  });

  await sendText({ to: convo.waFrom, text: parsed.data.text, preview_url: true });

  await prisma.message.create({
    data: { conversationId: convo.id, direction:'OUT', sender:'HUMAN', type:'TEXT', text: parsed.data.text }
  });

  await prisma.conversationEvent.create({
    data: { conversationId: convo.id, kind:'HUMAN_SENT_MESSAGE', payload: { by: acting.sub } }
  });

  return res.json({ ok: true });
});

conversationsRouter.post('/:id/note', async (req, res) => {
  const acting = (req as any).user;
  const schema = z.object({ text: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid payload' });

  await prisma.note.create({ data: { conversationId: req.params.id, userId: acting.sub, text: parsed.data.text } });
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
