import { detectIntent } from './intent.js';
import {
  buildAskClarify,
  buildHandoffMsg,
  buildInstallmentsReply,
  buildSearchReply,
  buildSoftClose,
  buildWelcome
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

type ConversationLike = {
  id: string;
  waFrom: string;
  intentScore: number;
  leadStatus: LeadStatus | string;
  state: ConversationState | string;
  assignedUserId?: string | null;
  botPausedUntil?: Date | string | null;
  lastHumanMsgAt?: Date | string | null;
  context: unknown;
};

type BotMemory = {
  v?: number;
  short?: {
    lastQuery?: string;
    lastIntent?: string;
    lastResults?: string[];
    lastResultsQuery?: string;
    lastResultsAt?: string;
    recentCustomer?: { t: string; ts: string }[];
    clarifyLoops?: number;
    moreCount?: number;
    wantsInstallments?: boolean;
    lastSoftCloseAt?: string;
  };
  long?: {
    name?: string;
    zone?: string;
    budgetArs?: number;
    productInterest?: string;
    financingHint?: string;
  };
  frustration?: {
    score?: number;
    lastAt?: string;
    lastTag?: string;
  };
  handoffAckTs?: number;
  handoffRequestedAt?: string;
  lastResumePromptAt?: string;
};

function shouldSoftClose(bot: BotMemory, now: Date) {
  const last = parseIsoDate(bot.short?.lastSoftCloseAt);
  if (!last) return true;
  return minutesBetween(now, last) >= 8;
}

function ensureObj(x: unknown): any {
  if (x && typeof x === 'object') return x as any;
  return {};
}

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function minutesBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

function parseIsoDate(d?: unknown): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'string') {
    const dt = new Date(d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  return null;
}

function detectMetaIntent(text: string, interactiveId?: string):
  | { kind: 'RESUME_BOT' }
  | { kind: 'WAIT_HUMAN' }
  | { kind: 'STOP' }
  | { kind: 'THANKS' }
  | { kind: 'GREETING' }
  | { kind: 'NEGATIVE' }
  | { kind: 'NONE' } {
  if (interactiveId === 'BOT') return { kind: 'RESUME_BOT' };
  if (interactiveId === 'WAIT_HUMAN') return { kind: 'WAIT_HUMAN' };

  const t = norm(text);
  if (!t.trim()) return { kind: 'NONE' };

  if (/\b(stop|baja|cancelar|no me escribas)\b/.test(t) || /\b(no\s+molestes|no\s+quiero)\b/.test(t)) return { kind: 'STOP' };
  if (/\b(gracias|genial|joya|perfecto|okey|ok)\b/.test(t)) return { kind: 'THANKS' };
  if (/\b(hola|buenas|buen\s+dia|buenas\s+tardes|buenas\s+noches)\b/.test(t)) {
    // Treat as greeting only if it's mostly a greeting (avoid hijacking searches like "hola ps5")
    const cleaned = t.replace(/\b(hola|buenas|buen\s+dia|buenas\s+tardes|buenas\s+noches)\b/g, '').trim();
    if (!cleaned || cleaned.split(/\s+/).length <= 1) return { kind: 'GREETING' };
  }
  if (/\b(no\s+gracias|no\s+quiero|no\s+me\s+sirve|ni\s+ahi)\b/.test(t)) return { kind: 'NEGATIVE' };

  return { kind: 'NONE' };
}

function detectFrustration(text: string): { delta: number; tag?: string } {
  const t = norm(text);
  if (!t.trim()) return { delta: 0 };

  const tags: Array<[RegExp, string, number]> = [
    [/\b(no\s+entiendo|explica|explicame|no\s+me\s+queda\s+claro)\b/, 'CONFUSED', 2],
    [/\b(una\s+locura|carisimo|carisima|re\s+caro|me\s+estas\s+cargando)\b/, 'PRICE_SHOCK', 2],
    [/\b(ya\s+te\s+dije|te\s+dije|otra\s+vez|de\s+nuevo)\b/, 'REPEAT', 1],
    [/\b(malo|pesimo|horrible|estafa)\b/, 'NEG_REVIEW', 2]
  ];

  for (const [re, tag, delta] of tags) {
    if (re.test(t)) return { delta, tag };
  }
  // Caps / excessive punctuation
  if ((text || '').length >= 10 && /[A-ZÁÉÍÓÚÑ]{6,}/.test(text)) return { delta: 1, tag: 'CAPS' };
  if (/(!{3,}|\?{3,})/.test(text)) return { delta: 1, tag: 'PUNCT' };
  return { delta: 0 };
}

function extractProfileHints(text: string): Partial<BotMemory['long']> {
  const raw = (text || '').trim();
  const t = norm(raw);
  const out: Partial<BotMemory['long']> = {};

  // name: "soy X", "me llamo X", "nombre X"
  const nameMatch = raw.match(/\b(me llamo|soy|mi nombre es)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,})?)\b/i);
  if (nameMatch?.[2]) out.name = nameMatch[2].trim();

  // zone: "soy de X", "zona X"
  const zoneMatch = raw.match(/\b(soy de|zona|vivo en)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,})?)\b/i);
  if (zoneMatch?.[2]) out.zone = zoneMatch[2].trim();

  // budget: detect ARS amounts (very approximate)
  const budgetMatch = raw.match(/\$\s?([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,})/);
  if (budgetMatch?.[1]) {
    const n = Number(budgetMatch[1].replace(/\./g, ''));
    if (Number.isFinite(n) && n > 0) out.budgetArs = n;
  }

  // financing hint
  if (/\b(cuotas|financi|tarjeta)\b/.test(t)) out.financingHint = 'Cuotas';

  return out;
}

async function sendAndStoreText(conversationId: string, to: string, text: string, preview_url: boolean) {
  const resp = await sendText({ to, text, preview_url });
  const waMessageId = (resp as any)?.data?.messages?.[0]?.id;
  await prisma.message.create({
    data: {
      conversationId,
      direction: 'OUT',
      sender: 'BOT',
      type: 'TEXT',
      text,
      waMessageId
    }
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastBotMsgAt: new Date() } });
  return waMessageId as string | undefined;
}

async function sendAndStoreButtons(
  conversationId: string,
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  const resp = await sendInteractiveButtons({ to, bodyText, buttons });
  const waMessageId = (resp as any)?.data?.messages?.[0]?.id;
  await prisma.message.create({
    data: {
      conversationId,
      direction: 'OUT',
      sender: 'BOT',
      type: 'TEXT',
      text: bodyText,
      waMessageId
    }
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastBotMsgAt: new Date() } });
  return waMessageId as string | undefined;
}

function computeLeadStatus(score: number, current: LeadStatus): LeadStatus {
  if (current === 'CLOSED_WON' || current === 'CLOSED_LOST') return current;
  if (current === 'HUMAN') return current;
  if (score >= 8) return 'HOT';
  if (score >= 4) return 'WARM';
  if (current === 'NEW') return 'COLD';
  return current === 'HOT_LOST' ? 'WARM' : 'COLD';
}

export async function handleIncomingCustomerMessage(
  convo: ConversationLike,
  text: string,
  interactiveId?: string
): Promise<BotResult> {
  const now = new Date();
  const rawText = (text || '').trim();
  const meta = detectMetaIntent(rawText, interactiveId);

  const ctx = ensureObj(convo.context);
  const bot: BotMemory = (ctx.bot ??= {});
  bot.v ??= 1;
  bot.short ??= {};
  bot.long ??= {};
  bot.frustration ??= {};

  // Store recent customer messages (short-term memory)
  const recent = (bot.short.recentCustomer ??= []);
  recent.push({ t: rawText.slice(0, 280), ts: now.toISOString() });
  while (recent.length > 10) recent.shift();

  // Persist profile hints (long-term memory)
  const hints = extractProfileHints(rawText);
  bot.long = { ...bot.long, ...hints };

  // Hard pause (botPausedUntil)
  const pausedUntil = parseIsoDate(convo.botPausedUntil);
  if (pausedUntil && pausedUntil > now) {
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { context: ctx, lastCustomerMsgAt: now }
    });
    return { replied: false };
  }

  // HUMAN_TAKEOVER handling (reversible)
  const lastHuman = parseIsoDate(convo.lastHumanMsgAt);
  if ((convo.state as any) === 'HUMAN_TAKEOVER') {
    if (meta.kind === 'RESUME_BOT' || /\b(volver\s+con\s+bot|bot\s+on|seguimos\s+con\s+bot)\b/i.test(rawText)) {
      await prisma.conversation.update({
        where: { id: convo.id },
        data: { state: 'BOT_ON', leadStatus: 'WARM', context: ctx, lastCustomerMsgAt: now }
      });
      await prisma.conversationEvent.create({
        data: { conversationId: convo.id, kind: 'BOT_RESUMED', payload: { by: meta.kind } }
      });
      const msg = bot.short.lastQuery ? `Listo ✅ sigo yo. ¿Querés ver más opciones de *${bot.short.lastQuery}* o buscás otra cosa?` : 'Listo ✅ sigo yo. ¿Qué estás buscando?';
      await sendAndStoreButtons(convo.id, convo.waFrom, msg, [
        { id: bot.short.lastQuery ? 'MORE' : 'PICK:ps5', title: bot.short.lastQuery ? 'Más opciones' : 'PS5' },
        { id: 'PICK:silla gamer', title: 'Silla gamer' },
        { id: 'INSTALLMENTS', title: 'Cuotas' }
      ]);
      return { replied: true };
    }

    if (meta.kind === 'WAIT_HUMAN') {
      await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx, lastCustomerMsgAt: now } });
      await sendAndStoreText(convo.id, convo.waFrom, 'Dale 👍 en breve te escribe un asesor.', false);
      return { replied: true };
    }

    // If no human response recently, offer reversible resume prompt (anti-spam)
    const mins = lastHuman ? minutesBetween(now, lastHuman) : 999;
    const lastPrompt = parseIsoDate(bot.lastResumePromptAt);
    const shouldPrompt = mins >= 15 && (!lastPrompt || minutesBetween(now, lastPrompt) >= 30);

    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx, lastCustomerMsgAt: now } });

    if (shouldPrompt) {
      bot.lastResumePromptAt = now.toISOString();
      await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });
      const msg = 'Estoy con un asesor en el chat. Si querés, puedo ayudarte mientras te atienden. ¿Cómo preferís seguir?';
      await sendAndStoreButtons(convo.id, convo.waFrom, msg, [
        { id: 'BOT', title: 'Seguir con bot' },
        { id: 'WAIT_HUMAN', title: 'Esperar asesor' },
        { id: 'INSTALLMENTS', title: 'Cuotas' }
      ]);
      await prisma.conversationEvent.create({
        data: { conversationId: convo.id, kind: 'BOT_RESUME_PROMPT', payload: { minsSinceHuman: mins } }
      });
      return { replied: true };
    }

    // Default: stay silent during takeover
    return { replied: false };
  }

  // STOP / opt-out
  if (meta.kind === 'STOP') {
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { leadStatus: 'COLD', intentScore: 0, context: ctx, lastCustomerMsgAt: now }
    });
    await prisma.conversationEvent.create({
      data: { conversationId: convo.id, kind: 'BOT_OPT_OUT', payload: { text: rawText.slice(0, 200) } }
    });
    await sendAndStoreText(convo.id, convo.waFrom, 'Perfecto. No te molesto más. Si más adelante querés algo, escribime cuando quieras.', false);
    return { replied: true };
  }

  // Quick "thanks" / greeting flows (keep them short)
  if (meta.kind === 'THANKS') {
    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx, lastCustomerMsgAt: now } });
    const wantsCuotas = !!(bot.short.wantsInstallments || bot.long.financingHint);
    const msg = bot.short.lastQuery
      ? `De una 🙌 Si querés ver *más opciones* de *${bot.short.lastQuery}*, decime *más*. Si buscás otra cosa, decime qué.`
      : 'De una 🙌 Decime qué estás buscando y te paso opciones.';
    const tail = wantsCuotas ? '\n\nSi lo querés en cuotas: *Visa/Mastercard 3 o 6 sin interés* (según promo).' : '';
    await sendAndStoreText(convo.id, convo.waFrom, msg + tail, false);
    return { replied: true };
  }

  if (meta.kind === 'GREETING') {
    const firstTouch = !ctx.welcomedAt;
    if (firstTouch) ctx.welcomedAt = now.toISOString();
    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx, lastCustomerMsgAt: now } });
    const msg = firstTouch ? buildWelcome() : '¡Hola! ¿Qué estás buscando?';
    await sendAndStoreButtons(convo.id, convo.waFrom, msg, [
      { id: 'PICK:ps5', title: 'PS5' },
      { id: 'PICK:silla gamer', title: 'Silla gamer' },
      { id: 'HUMAN', title: 'Asesor' }
    ]);
    return { replied: true };
  }

  if (meta.kind === 'NEGATIVE') {
    // Keep it human: acknowledge and offer alternatives.
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { intentScore: Math.max(0, (convo.intentScore ?? 0) - 1), leadStatus: 'COLD', context: ctx, lastCustomerMsgAt: now }
    });
    const msg = 'Ok 👍 Si querés, te paso alternativas más económicas o similares. Decime: ¿qué presupuesto tenés aprox y qué estabas buscando?';
    await sendAndStoreText(convo.id, convo.waFrom, msg, false);
    return { replied: true };
  }

  // other meta intents fall through

  // 0) Numeric selection (1/2/3...) from lastResults
  if (/^[1-9]\d*$/.test(rawText)) {
    const idx = Number(rawText) - 1;

    const ids: string[] = (ctx.lastResults as any) || bot.short.lastResults || [];
    if (ids.length && (idx < 0 || idx >= ids.length)) {
      await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx, lastCustomerMsgAt: now } });
      const msg = `Respondé con un número del *1* al *${ids.length}* 🙂\nSi querés volver a ver opciones, decime *más*.`;
      await sendAndStoreText(convo.id, convo.waFrom, msg, false);
      return { replied: true };
    }
    if (idx >= 0 && idx < ids.length) {
      const itemId = ids[idx];

      const { loadCatalog } = await import('../catalog/catalog.repo.js');
      const item = loadCatalog().find((x: any) => x.id === itemId);

      if (item) {
        const price =
          item.price != null
            ? `$${Number(item.price).toLocaleString('es-AR')}`
            : (item.price_raw ?? '');

        const wantsCuotas = !!(bot.short.wantsInstallments || bot.long.financingHint);
        const cuotasLine = wantsCuotas
          ? '\n💳 Cuotas: *Visa/Mastercard 3 o 6 sin interés* (según promo).\nDecime si preferís *3* o *6*.'
          : '';

        const reply =
          `✅ *${item.name}*\n` +
          (price ? `💲 ${price}\n` : '') +
          (item.url ? `🔗 ${item.url}\n` : '') +
          `${cuotasLine}\n\n¿Querés ver más opciones parecidas? (decime *más*)`;

        await prisma.conversation.update({
          where: { id: convo.id },
          data: { context: ctx, lastCustomerMsgAt: now }
        });
        await sendAndStoreText(convo.id, convo.waFrom, reply, true);
        return { replied: true };
      }
    }

    if (!((ctx.lastResults as any) || bot.short.lastResults)?.length) {
      const fallback =
        'Decime qué estás buscando (ej: “silla gamer”, “mouse”, “teclado”) y te paso opciones para elegir por número.';
      await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx, lastCustomerMsgAt: now } });
      await sendAndStoreText(convo.id, convo.waFrom, fallback, false);
      return { replied: true };
    }
  }

  // Frustration scoring (stored persistently)
  const fr = detectFrustration(rawText);
  if (fr.delta) {
    bot.frustration.score = Math.min(10, (bot.frustration.score ?? 0) + fr.delta);
    bot.frustration.lastAt = now.toISOString();
    bot.frustration.lastTag = fr.tag;
  } else {
    // slow decay
    bot.frustration.score = Math.max(0, (bot.frustration.score ?? 0) - 0.25);
  }

  // Main intent
  const intent = detectIntent(rawText, interactiveId);
  bot.short.lastIntent = intent.kind;

  // Query memory
  if (intent.kind === 'SEARCH' && intent.query) {
    bot.short.lastQuery = intent.query;
    bot.long.productInterest = intent.query;
  }
  if (intent.kind === 'PRICE') {
    // If user asks price but didn't specify product, use lastQuery if recent.
    const hasQueryWords = rawText.length >= 3 && rawText.split(/\s+/).length >= 2;
    if (!hasQueryWords && bot.short.lastQuery) {
      // keep
    }
  }

  // Update score + lead status
  const newScore = Math.max(0, (convo.intentScore ?? 0) + intent.scoreDelta);
  const leadStatus = computeLeadStatus(newScore, convo.leadStatus as LeadStatus);

  // First touch
  const firstTouch = !ctx.welcomedAt;
  if (firstTouch) ctx.welcomedAt = now.toISOString();

  // Persist context / scoring before any bot response
  ctx.bot = bot;
  await prisma.conversation.update({
    where: { id: convo.id },
    data: { intentScore: newScore, leadStatus, context: ctx, lastCustomerMsgAt: now }
  });

  // Handoff triggers
  const frustrationScore = bot.frustration.score ?? 0;
  const shouldHandoff =
    intent.kind === 'HUMAN' ||
    intent.kind === 'BUY_SIGNAL' ||
    newScore >= 7 ||
    frustrationScore >= 4;

  if (shouldHandoff) {
    await tryAssignSeller(convo.id);

    const handoffText = buildHandoffMsg(convo.id, ctx);
    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });

    await sendAndStoreText(convo.id, convo.waFrom, handoffText, false);

    await prisma.conversationEvent.create({
      data: {
        conversationId: convo.id,
        kind: 'HANDOFF_REQUESTED',
        payload: {
          reason: intent.kind,
          score: newScore,
          frustration: frustrationScore
        }
      }
    });
    // Keep BOT_ON: bot continues unless a human takes over
    return { replied: true };
  }

  // Clarify/ambiguity handling
  const lastQuery = bot.short.lastQuery || (ctx.lastQuery as any);
  const lastResultsQuery = bot.short.lastResultsQuery || (ctx.lastResultsQuery as any);
  const queryForMore = lastQuery || lastResultsQuery;

  if (intent.kind === 'MORE') {
    if (!queryForMore) {
      bot.short.clarifyLoops = (bot.short.clarifyLoops ?? 0) + 1;
      ctx.bot = bot;
      await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });
      const msg = '¿Qué querés ver exactamente? (ej: *PS5*, *silla gamer*, *notebook*, *monitor*)';
      await sendAndStoreButtons(convo.id, convo.waFrom, msg, [
        { id: 'PICK:ps5', title: 'PS5' },
        { id: 'PICK:silla gamer', title: 'Silla gamer' },
        { id: 'HUMAN', title: 'Asesor' }
      ]);
      return { replied: true };
    }

    const moreCount = (bot.short.moreCount ?? 0) + 1;
    bot.short.moreCount = moreCount;
    const take = moreCount === 1 ? 6 : 9;
    const products = searchProductsFromJson(queryForMore, take);

    ctx.lastResults = products.map((p: any) => p.id);
    ctx.lastResultsQuery = queryForMore;
    ctx.lastResultsAt = now.toISOString();

    bot.short.lastResults = ctx.lastResults;
    bot.short.lastResultsQuery = queryForMore;
    bot.short.lastResultsAt = ctx.lastResultsAt;

    ctx.bot = bot;
    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });

    const wantsCuotas = !!(bot.short.wantsInstallments || bot.long.financingHint);
    const tail = wantsCuotas
      ? '\n\n💳 Cuotas: *Visa/Mastercard 3 o 6 sin interés* (según promo).'
      : '\n\nSi querés cuotas, decime *cuotas*. Si querés más opciones, decime *más*.';

    const msg = products.length
      ? `${buildSearchReply(products as any, queryForMore)}${tail}`
      : buildAskClarify();

    await sendAndStoreText(convo.id, convo.waFrom, msg, true);
    return { replied: true };
  }

  if (intent.kind === 'INSTALLMENTS') {
    // Persist intent so the next pick can keep the "cuotas" context.
    bot.short.wantsInstallments = true;
    bot.long.financingHint = 'Cuotas';
    ctx.bot = bot;
    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });

    const msg = buildInstallmentsReply() + (queryForMore ? `\n\nSi querés, decime *más* y te muestro más opciones de *${queryForMore}* para elegir por número.` : '');
    await sendAndStoreText(convo.id, convo.waFrom, msg, false);
    return { replied: true };
  }

  if (intent.kind === 'PRICE') {
    // If the message is basically "precio?" without product, force clarify
    const t = norm(rawText);
    const isBarePrice = /\b(precio|cuanto\s+sale|cuanto\s+esta|valor|vale)\b/.test(t) && t.split(/\s+/).length <= 3;

    if (isBarePrice && !queryForMore) {
      bot.short.clarifyLoops = (bot.short.clarifyLoops ?? 0) + 1;
      ctx.bot = bot;
      await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });
      const msg = '¿De qué producto querés el precio? Elegí una opción o decime cuál buscás.';
      await sendAndStoreButtons(convo.id, convo.waFrom, msg, [
        { id: 'PICK:ps5', title: 'PS5' },
        { id: 'PICK:silla gamer', title: 'Silla gamer' },
        { id: 'PICK:notebook', title: 'Notebook' }
      ]);
      return { replied: true };
    }

    const q = queryForMore || rawText;
    const products = searchProductsFromJson(q, 3);

    ctx.lastResults = products.map((p: any) => p.id);
    ctx.lastResultsQuery = q;
    ctx.lastResultsAt = now.toISOString();
    ctx.lastQuery = q;
    bot.short.lastQuery = q;
    bot.short.lastResults = ctx.lastResults;
    bot.short.lastResultsQuery = q;
    bot.short.lastResultsAt = ctx.lastResultsAt;
    ctx.bot = bot;

    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });

    const wantsCuotas = !!(bot.short.wantsInstallments || bot.long.financingHint);
    const soft = shouldSoftClose(bot, now)
      ? (wantsCuotas
          ? '\n\n💳 Cuotas: *Visa/Mastercard 3 o 6 sin interés* (según promo).'
          : `\n\n${buildSoftClose()}`)
      : '';
    if (soft) bot.short.lastSoftCloseAt = now.toISOString();

    const msg = products.length
      ? `${buildSearchReply(products as any, q)}${soft}`
      : (firstTouch ? buildWelcome() : buildAskClarify());

    await sendAndStoreText(convo.id, convo.waFrom, msg, true);
    return { replied: true };
  }

  if (intent.kind === 'SEARCH') {
    const q = intent.query || rawText;
    const products = searchProductsFromJson(q, 3);

    ctx.lastResults = products.map((p: any) => p.id);
    ctx.lastResultsQuery = q;
    ctx.lastResultsAt = now.toISOString();
    ctx.lastQuery = q;

    bot.short.lastQuery = q;
    bot.short.lastResults = ctx.lastResults;
    bot.short.lastResultsQuery = q;
    bot.short.lastResultsAt = ctx.lastResultsAt;
    bot.long.productInterest = q;
    ctx.bot = bot;

    await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });

    const wantsCuotas = !!(bot.short.wantsInstallments || bot.long.financingHint);
    const soft = products.length && shouldSoftClose(bot, now)
      ? (wantsCuotas
          ? '\n\n💳 Cuotas: *Visa/Mastercard 3 o 6 sin interés* (según promo).'
          : `\n\n${buildSoftClose()}`)
      : '';
    if (soft) bot.short.lastSoftCloseAt = now.toISOString();

    const base = products.length
      ? buildSearchReply(products as any, q)
      : (firstTouch ? buildWelcome() : buildAskClarify());
    const msg = products.length ? `${base}${soft}` : base;

    await sendAndStoreText(convo.id, convo.waFrom, msg, true);
    return { replied: true };
  }

  // UNKNOWN / default
  bot.short.clarifyLoops = (bot.short.clarifyLoops ?? 0) + 1;
  ctx.bot = bot;
  await prisma.conversation.update({ where: { id: convo.id }, data: { context: ctx } });

  // If we keep looping, escalate gently
  if ((bot.short.clarifyLoops ?? 0) >= 3) {
    await tryAssignSeller(convo.id);
    const msg = 'Te entiendo. Para no hacerte perder tiempo, ¿querés que te atienda un asesor humano?';
    await sendAndStoreButtons(convo.id, convo.waFrom, msg, [
      { id: 'HUMAN', title: 'Sí, asesor' },
      { id: 'PICK:ps5', title: 'PS5' },
      { id: 'PICK:notebook', title: 'Notebook' }
    ]);
    await prisma.conversationEvent.create({
      data: { conversationId: convo.id, kind: 'CLARIFY_ESCALATE', payload: { loops: bot.short.clarifyLoops } }
    });
    return { replied: true };
  }

  const msg = firstTouch ? buildWelcome() : buildAskClarify();
  // Avoid spamming menus: only show quick buttons on first touch or when the user seems stuck.
  if (firstTouch || (bot.short.clarifyLoops ?? 0) >= 2) {
    await sendAndStoreButtons(convo.id, convo.waFrom, msg, [
      { id: 'PICK:ps5', title: 'PS5' },
      { id: 'PICK:silla gamer', title: 'Silla gamer' },
      { id: 'HUMAN', title: 'Asesor' }
    ]);
  } else {
    await sendAndStoreText(convo.id, convo.waFrom, msg, false);
  }
  return { replied: true };
}
