import { detectIntent } from './intent.js';
import { searchProducts } from './catalog.js';
import {
  buildAskClarify,
  buildWelcome,
  buildSoftClose,
  buildAfterHoursCapture,
  buildHandoffMsg,
  buildInstallmentsReply,
  buildSearchReply
} from './messages.js';
import { isWithinHumanHours } from '../utils/time.js';
import { prisma } from '../db/prisma.js';
import { sendInteractiveButtons, sendText } from '../whatsapp/client.js';
import { requestHandoffIfNeeded } from '../handoff/engine.js';

type BotResult = { replied: boolean };

// Keep runtime independent from Prisma named exports (ESM/CJS interop).
type ConversationState = 'BOT_ON' | 'HUMAN_TAKEOVER';
type LeadStatus = 'NEW' | 'COLD' | 'WARM' | 'HOT_WAITING' | 'HOT' | 'HUMAN' | 'CLOSED_WON' | 'CLOSED_LOST' | 'HOT_LOST';

// Minimal shape we need from a Conversation row.
type ConversationLike = {
  id: string;
  waFrom: string;
  intentScore: number;
  leadStatus: LeadStatus | string;
  state: ConversationState | string;
  context: unknown;
};

export async function handleIncomingCustomerMessage(
  convo: ConversationLike,
  text: string,
  interactiveId?: string
): Promise<BotResult> {
  const intent = detectIntent(text, interactiveId);

  // Update score + status
  const newScore = Math.max(0, (convo.intentScore ?? 0) + intent.scoreDelta);
  const leadStatus = computeLeadStatus(newScore, convo.leadStatus as LeadStatus);
  const withinHours = isWithinHumanHours(new Date());

  // Save context
  const ctx: any = (convo.context as any) || {};
  const firstTouch = !ctx.welcomedAt;
  if (firstTouch) ctx.welcomedAt = new Date().toISOString();
  if (intent.kind === 'SEARCH' && intent.query) ctx.lastQuery = intent.query;
  if (intent.kind === 'HUMAN') ctx.humanRequested = true;
  if (intent.kind === 'BUY_SIGNAL') ctx.buySignalAt = new Date().toISOString();

  await prisma.conversation.update({
    where: { id: convo.id },
    data: { intentScore: newScore, leadStatus, context: ctx, lastCustomerMsgAt: new Date() }
  });

  // Handoff logic: explicit human or buy signal or score threshold
  const shouldHandoff = intent.kind === 'HUMAN' || intent.kind === 'BUY_SIGNAL' || newScore >= 6;

  if (shouldHandoff && withinHours) {
    const handoffText = buildHandoffMsg();

    // send a short handoff message, then request takeover
    await sendText({ to: convo.waFrom, text: handoffText, preview_url: false });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: handoffText }
    });

    await prisma.conversation.update({
      where: { id: convo.id },
      data: { state: 'HUMAN_TAKEOVER', leadStatus: 'HUMAN', lastBotMsgAt: new Date() }
    });

    await prisma.conversationEvent.create({
      data: { conversationId: convo.id, kind: 'AUTO_TAKEOVER_REQUEST', payload: { reason: intent.kind, score: newScore } }
    });

    await requestHandoffIfNeeded(convo.id);
    return { replied: true };
  }

  if (shouldHandoff && !withinHours) {
    // after hours: keep bot, capture data, mark HOT_WAITING
    const msg = buildAfterHoursCapture();
    await sendInteractiveButtons({
      to: convo.waFrom,
      bodyText: msg,
      buttons: [
        { id: 'INSTALLMENTS', title: 'Cuotas' },
        { id: 'HUMAN', title: 'Asesor (mañana)' },
        { id: 'MORE', title: 'Ver catálogo' }
      ]
    });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg }
    });
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { lastBotMsgAt: new Date(), leadStatus: 'HOT_WAITING' }
    });
    return { replied: true };
  }

  // Normal conversational responses
  if (intent.kind === 'INSTALLMENTS') {
    const msg = buildInstallmentsReply();
    await sendInteractiveButtons({
      to: convo.waFrom,
      bodyText: msg,
      buttons: [
        { id: 'HUMAN', title: 'Hablar con asesor' },
        { id: 'MORE', title: 'Ver opciones' },
        { id: 'BUY', title: 'Quiero comprar' }
      ]
    });
    await prisma.message.create({ data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg } });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastBotMsgAt: new Date() } });
    return { replied: true };
  }

  if (intent.kind === 'PRICE') {
    const q = (convo.context as any)?.lastQuery || text;
    const products = await searchProducts(q, 3);
    const msg = products.length
      ? `${buildSearchReply(products, q)}\n\n${buildSoftClose()}`
      : (firstTouch ? buildWelcome() : buildAskClarify());
    await sendInteractiveButtons({
      to: convo.waFrom,
      bodyText: msg,
      buttons: [
        { id: 'HUMAN', title: 'Hablar con asesor' },
        { id: 'INSTALLMENTS', title: 'Cuotas' },
        { id: 'MORE', title: 'Más opciones' }
      ]
    });
    await prisma.message.create({ data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg } });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastBotMsgAt: new Date() } });
    return { replied: true };
  }

  if (intent.kind === 'SEARCH') {
    const q = intent.query || text;
    const products = await searchProducts(q, 3);
    const base = products.length ? buildSearchReply(products, q) : (firstTouch ? buildWelcome() : buildAskClarify());
    const msg = products.length ? `${base}\n\n${buildSoftClose()}` : base;
    await sendInteractiveButtons({
      to: convo.waFrom,
      bodyText: msg,
      buttons: [
        { id: 'HUMAN', title: 'Hablar con asesor' },
        { id: 'INSTALLMENTS', title: 'Cuotas' },
        { id: 'MORE', title: 'Más' }
      ]
    });
    await prisma.message.create({ data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg } });
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { lastBotMsgAt: new Date(), context: { ...(convo.context as any), lastQuery: q } }
    });
    return { replied: true };
  }

  // Unknown: first message -> welcome; else ask clarify
  const msg = firstTouch ? buildWelcome() : buildAskClarify();
  await sendInteractiveButtons({
    to: convo.waFrom,
    bodyText: msg,
    buttons: [
      { id: 'PICK:ps5', title: 'PS5' },
      { id: 'PICK:silla gamer', title: 'Silla gamer' },
      { id: 'HUMAN', title: 'Asesor' }
    ]
  });
  await prisma.message.create({ data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg } });
  await prisma.conversation.update({ where: { id: convo.id }, data: { lastBotMsgAt: new Date() } });
  return { replied: true };
}

function computeLeadStatus(score: number, current: LeadStatus): LeadStatus {
  if (current === 'CLOSED_WON' || current === 'CLOSED_LOST') return current;
  if (current === 'HUMAN') return current;
  if (score >= 8) return 'HOT';
  if (score >= 4) return 'WARM';
  if (current === 'NEW') return 'COLD';
  return current === 'HOT_LOST' ? 'WARM' : 'COLD';
}
