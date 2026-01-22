import { Router } from 'express';
import { env } from '../env.js';
import { verifyHubSignature } from '../utils/hmac.js';
import { prisma } from '../db/prisma.js';
import { handleIncomingCustomerMessage } from '../bot/engine.js';
import { io } from '../server/socket.js';

export const webhookRouter = Router();

// Meta verification: GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
webhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// WhatsApp webhook: POST /webhook
webhookRouter.post('/', async (req, res) => {
  // signature verification
  const sig = req.header('X-Hub-Signature-256');
  const raw = (req as any).rawBody as Buffer | undefined;

  const ok = raw ? verifyHubSignature(raw, env.META_APP_SECRET, sig) : false;
  if (!ok && env.WEBHOOK_SIGNATURE_MODE === 'required') {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ACK fast
  res.sendStatus(200);

  try {
    const body = req.body;

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // messages
    const messages = value?.messages || [];
    for (const m of messages) {
      const from = m.from; // customer WA ID
      const type = m.type;
      const waMessageId = m.id;

      // idempotency: ignore if already stored
      const exists = await prisma.message.findUnique({ where: { waMessageId } });
      if (exists) continue;

      let text: string = '';
      let interactiveId: string | undefined;

      if (type === 'text') text = m.text?.body || '';
      if (type === 'interactive') {
        // button reply
        const br = m.interactive?.button_reply;
        if (br?.id) interactiveId = br.id;
        text = br?.title || 'interactive';
      }

      // Upsert conversation by waFrom (customer)
      const convo = await prisma.conversation.upsert({
        where: { waFrom: from },
        create: { waFrom: from, state: 'BOT_ON' },
        update: { updatedAt: new Date() }
      });

      await prisma.message.create({
        data: {
          conversationId: convo.id,
          direction: 'IN',
          sender: 'CUSTOMER',
          type: type === 'text' || type === 'interactive' ? 'TEXT' : 'SYSTEM',
          text: text || `[${type}]`,
          waMessageId
        }
      });

      await prisma.conversation.update({
        where: { id: convo.id },
        data: { lastCustomerMsgAt: new Date() }
      });

      // realtime notify panel
      io.emit('message:new', { conversationId: convo.id });

      // If human takeover: bot stays silent
      const current = await prisma.conversation.findUnique({ where: { id: convo.id } });
      if (!current) continue;

      if (current.state === 'HUMAN_TAKEOVER') {
        await prisma.conversationEvent.create({
          data: { conversationId: convo.id, kind:'BOT_SILENCED_HUMAN_TAKEOVER', payload: {} }
        });
        continue;
      }

      await handleIncomingCustomerMessage(current, text, interactiveId);
      io.emit('conversation:updated', { conversationId: convo.id });
    }

    // statuses
    const statuses = value?.statuses || [];
    for (const s of statuses) {
      await prisma.conversationEvent.create({
        data: { conversationId: (await findConversationIdByToOrFrom(s.recipient_id)) || undefined as any, kind:'WA_STATUS', payload: s }
      }).catch(()=>{});
    }

  } catch (e) {
    console.error('Webhook processing error', e);
  }
});

async function findConversationIdByToOrFrom(_recipientId: string): Promise<string | null> {
  // recipient_id is typically the business number; not useful to map to a conversation.
  // left here for future improvements.
  return null;
}
