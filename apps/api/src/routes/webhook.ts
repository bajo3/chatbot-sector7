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

  // ACK fast (Meta retries aggressively if we don't answer quickly)
  res.sendStatus(200);

  try {
    const body = req.body;

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // --- messages ---
    const messages = value?.messages || [];
    for (const m of messages) {
      const from: string | undefined = m?.from; // customer WA ID
      const type: string | undefined = m?.type;
      const waMessageId: string | undefined = m?.id;
      if (!from || !type || !waMessageId) continue;

      // idempotency: ignore if already stored
      const exists = await prisma.message.findUnique({ where: { waMessageId } });
      if (exists) continue;

      const parsed = parseIncomingMessage(m);

      // Upsert conversation by waFrom (customer)
      // IMPORTANT: don't force LeadStatus.NEW here.
      // Some DBs may not have the NEW enum value applied yet (Postgres enum add-value gotcha).
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
          type: parsed.messageType,
          text: parsed.text,
          mediaUrl: parsed.mediaUrl,
          waMessageId
        }
      });

      await prisma.conversation.update({
        where: { id: convo.id },
        data: { lastCustomerMsgAt: new Date() }
      });

      // realtime notify panel
      safeEmit('message:new', { conversationId: convo.id });

      // Always hand control to the bot engine.
      // The engine itself enforces:
      // - botPausedUntil
      // - HUMAN_TAKEOVER (silent, with reversible resume prompt)
      const current = await prisma.conversation.findUnique({ where: { id: convo.id } });
      if (!current) continue;

      await handleIncomingCustomerMessage(current as any, parsed.text ?? '', parsed.interactiveId);
      safeEmit('conversation:updated', { conversationId: convo.id });
    }

    // --- statuses ---
    const statuses = value?.statuses || [];
    for (const s of statuses) {
      const conversationId = await findConversationIdForStatus(s);
      if (!conversationId) continue;
      await prisma.conversationEvent.create({
        data: { conversationId, kind: 'WA_STATUS', payload: s }
      });
    }

  } catch (e) {
    console.error('Webhook processing error', e);
  }
});

function safeEmit(event: string, payload: any) {
  try {
    io?.emit?.(event, payload);
  } catch {
    // ignore websocket errors from webhook path
  }
}

function parseIncomingMessage(m: any): {
  text: string | null;
  interactiveId?: string;
  messageType: 'TEXT' | 'IMAGE' | 'AUDIO' | 'SYSTEM';
  mediaUrl?: string | null;
} {
  const type = m?.type;

  // text
  if (type === 'text') {
    return { text: m?.text?.body ?? '', messageType: 'TEXT' };
  }

  // interactive (buttons / list)
  if (type === 'interactive') {
    const br = m?.interactive?.button_reply;
    const lr = m?.interactive?.list_reply;
    const id = br?.id ?? lr?.id;
    const title = br?.title ?? lr?.title ?? 'interactive';
    return { text: title, interactiveId: id, messageType: 'TEXT' };
  }

  // media placeholders (store text so the bot can react)
  if (type === 'image') {
    return { text: '[imagen]', messageType: 'IMAGE', mediaUrl: null };
  }
  if (type === 'audio' || type === 'voice') {
    return { text: '[audio]', messageType: 'AUDIO', mediaUrl: null };
  }

  return { text: `[${type ?? 'unknown'}]`, messageType: 'SYSTEM' };
}

async function findConversationIdForStatus(s: any): Promise<string | null> {
  // Preferred: match by WA message id (status.id)
  const statusId: string | undefined = s?.id;
  if (statusId) {
    const msg = await prisma.message.findUnique({
      where: { waMessageId: statusId },
      select: { conversationId: true }
    });
    if (msg?.conversationId) return msg.conversationId;
  }

  // Fallback: recipient_id is often the customer WA ID for outbound statuses
  const recipient: string | undefined = s?.recipient_id;
  if (recipient) {
    const convo = await prisma.conversation.findUnique({ where: { waFrom: recipient }, select: { id: true } });
    if (convo?.id) return convo.id;
  }

  return null;
}
