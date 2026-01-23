import { detectIntent } from './intent.js';
import {
  buildAskClarify,
  buildWelcome,
  buildSoftClose,  buildHandoffMsg,
  buildInstallmentsReply,
  buildSearchReply
} from './messages.js'; 
import { prisma } from '../db/prisma.js';
import { sendInteractiveButtons, sendText } from '../whatsapp/client.js';
import { tryAssignSeller } from '../handoff/engine.js';
import { searchProductsFromJson } from './catalogSearch.js';

type BotResult = { replied: boolean };

// Keep runtime independent from Prisma named exports (ESM/CJS interop).
type ConversationState = 'BOT_ON' | 'HUMAN_TAKEOVER';
type LeadStatus =
  | 'NEW'
  | 'COLD'
  | 'WARM'
  | 'HOT_WAITING'
  | 'HOT'
  | 'HUMAN'
  | 'CLOSED_WON'
  | 'CLOSED_LOST'
  | 'HOT_LOST';

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
  // 0) Selection by number (1/2/3...) from lastResults
  const t = (text || '').trim();
  if (/^[1-9]\d*$/.test(t)) {
    const idx = Number(t) - 1;

    const ctxAny: any = (convo.context as any) || {};
    const ids: string[] = ctxAny.lastResults || [];

    if (idx >= 0 && idx < ids.length) {
      const itemId = ids[idx];

      const { loadCatalog } = await import('../catalog/catalog.repo.js');
      const item = loadCatalog().find((x: any) => x.id === itemId);

      if (item) {
        const price =
          item.price != null
            ? `$${Number(item.price).toLocaleString('es-AR')}`
            : (item.price_raw ?? '');

        const reply =
          `✅ *${item.name}*\n` +
          (price ? `💲 ${price}\n` : '') +
          (item.url ? `🔗 ${item.url}\n` : '') +
          `\n¿Querés ver más opciones parecidas?`;

        await sendText({ to: convo.waFrom, text: reply, preview_url: true });
        await prisma.message.create({
          data: {
            conversationId: convo.id,
            direction: 'OUT',
            sender: 'BOT',
            type: 'TEXT',
            text: reply
          }
        });
        await prisma.conversation.update({
          where: { id: convo.id },
          data: { lastBotMsgAt: new Date() }
        });

        return { replied: true };
      }
    }

    // If they sent a number but we don't have a previous list stored
    if (!ids.length) {
      const fallback =
        'Decime qué estás buscando (ej: “silla gamer”, “mouse”, “teclado”) y te paso opciones para elegir por número.';
      await sendText({ to: convo.waFrom, text: fallback, preview_url: false });
      await prisma.message.create({
        data: {
          conversationId: convo.id,
          direction: 'OUT',
          sender: 'BOT',
          type: 'TEXT',
          text: fallback
        }
      });
      await prisma.conversation.update({
        where: { id: convo.id },
        data: { lastBotMsgAt: new Date() }
      });
      return { replied: true };
    }
  }

  const intent = detectIntent(text, interactiveId);

  // Update score + status
  const newScore = Math.max(0, (convo.intentScore ?? 0) + intent.scoreDelta);
  const leadStatus = computeLeadStatus(newScore, convo.leadStatus as LeadStatus);

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


// Handoff logic (NO horarios):
// - Bot responde siempre
// - Si el cliente pide asesor o hay señal de compra, intentamos asignar un vendedor online (si hay)
// - No cambiamos el estado a HUMAN_TAKEOVER automáticamente (eso se hace solo cuando un humano toma el chat)
const shouldHandoff = intent.kind === 'HUMAN' || intent.kind === 'BUY_SIGNAL' || newScore >= 6;

if (shouldHandoff) {
  // Intentar asignar un vendedor si hay alguno online (no silencia al bot)
  await tryAssignSeller(convo.id);

  const handoffText = buildHandoffMsg();
  await sendText({ to: convo.waFrom, text: handoffText, preview_url: false });
  await prisma.message.create({
    data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: handoffText }
  });

  await prisma.conversationEvent.create({
    data: {
      conversationId: convo.id,
      kind: 'HANDOFF_REQUESTED',
      payload: { reason: intent.kind, score: newScore }
    }
  });

  // Seguimos en BOT_ON para que el bot no se silencie
  await prisma.conversation.update({
    where: { id: convo.id },
    data: { lastBotMsgAt: new Date(), leadStatus: 'HOT' }
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
    await prisma.message.create({
      data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg }
    });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastBotMsgAt: new Date() } });
    return { replied: true };
  }

  if (intent.kind === 'PRICE') {
    const q = (convo.context as any)?.lastQuery || text;
    const products = searchProductsFromJson(q, 3);

    // store last results for numeric selection
    const ctxAny: any = (convo.context as any) || {};
    ctxAny.lastResults = products.map((p: any) => p.id);
    ctxAny.lastResultsQuery = q;
    ctxAny.lastResultsAt = new Date().toISOString();
    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctxAny } });

    const msg = products.length
      ? `${buildSearchReply(products as any, q)}\n\n${buildSoftClose()}`
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

    await prisma.message.create({
      data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg }
    });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastBotMsgAt: new Date() } });
    return { replied: true };
  }

  if (intent.kind === 'SEARCH') {
    const q = intent.query || text;
    const products = searchProductsFromJson(q, 3);

    // store last results for numeric selection
    const ctxAny: any = (convo.context as any) || {};
    ctxAny.lastResults = products.map((p: any) => p.id);
    ctxAny.lastResultsQuery = q;
    ctxAny.lastResultsAt = new Date().toISOString();
    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctxAny } });

    const base = products.length ? buildSearchReply(products as any, q) : (firstTouch ? buildWelcome() : buildAskClarify());
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

    await prisma.message.create({
      data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg }
    });

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
  await prisma.message.create({
    data: { conversationId: convo.id, direction: 'OUT', sender: 'BOT', type: 'TEXT', text: msg }
  });
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
