import { z } from 'zod';
import { env } from '../../env.js';
import { chatCompletionText } from './openai.js';

export type HybridIntentKind =
  | 'SEARCH'
  | 'PRICE'
  | 'INSTALLMENTS'
  | 'HUMAN'
  | 'MORE'
  | 'UNKNOWN'
  | 'BUY_SIGNAL';

export type HybridDecision = {
  kind: HybridIntentKind;
  query?: string;
  maxPriceArs?: number;
  wantsInstallments?: boolean;
  confidence?: number;
  usedReasoning?: boolean;
};

const DecisionSchema = z.object({
  kind: z.enum(['SEARCH', 'PRICE', 'INSTALLMENTS', 'HUMAN', 'MORE', 'UNKNOWN', 'BUY_SIGNAL']),
  query: z.string().optional().nullable(),
  maxPriceArs: z.number().int().positive().optional().nullable(),
  wantsInstallments: z.boolean().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable()
});

function safeJsonExtract(text: string): any {
  const t = (text || '').trim();
  // Try direct parse first
  try {
    return JSON.parse(t);
  } catch {
    // Try extracting first JSON object block
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function normLite(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function shouldUseReasoning(args: {
  apiKeyPresent: boolean;
  alreadyUsed: boolean;
  interactiveId?: string;
  metaKind?: string;
  firstTouch: boolean;
  baseKind: HybridIntentKind;
  rawText: string;
}): boolean {
  if (!args.apiKeyPresent) return false;
  if (args.alreadyUsed) return false;
  if (args.interactiveId) return false; // buttons are already structured

  const mk = args.metaKind || 'NONE';
  if (mk !== 'NONE') return false;

  const t = (args.rawText || '').trim();
  if (t.length < 3) return false;

  // Use reasoning early in the convo, or when uncertain/ambiguous.
  if (args.firstTouch) return true;
  if (args.baseKind === 'UNKNOWN') return true;

  // If the user writes a sentence (more natural) and we need to extract query
  if (t.split(/\s+/).length >= 6) return true;

  // If looks like search but with typos / weird tokens
  const tl = normLite(t);
  if (/(aurical|auricul|auri|headset|casco)/.test(tl)) return true;

  return false;
}

export async function decideWithReasoning(params: {
  rawText: string;
  lastQuery?: string;
  lastResultsQuery?: string;
  wantsInstallments?: boolean;
  recentCustomer?: { t: string; ts: string }[];
}): Promise<HybridDecision> {
  const model = (env.OPENAI_MODEL_REASONING || 'gpt-4.1').trim() || 'gpt-4.1';

  const recent = (params.recentCustomer || []).slice(-6).map((m) => `- ${m.t}`).join('\n');

  const system =
    'Sos un asistente de ventas para un local de tecnología (WhatsApp). ' +
    'Tu tarea es SOLO clasificar intención y extraer una consulta de búsqueda corta (2-6 palabras) cuando aplique. ' +
    'Respondé ÚNICAMENTE con un JSON válido.';

  const user =
    `Mensaje del cliente: "${params.rawText}"\n\n` +
    `Contexto (si existe):\n` +
    `- lastQuery: ${params.lastQuery || ''}\n` +
    `- lastResultsQuery: ${params.lastResultsQuery || ''}\n` +
    `- wantsInstallments: ${params.wantsInstallments ? 'true' : 'false'}\n` +
    (recent ? `- Mensajes recientes del cliente:\n${recent}\n` : '') +
    `\nReglas:\n` +
    `- kind: SEARCH si pide un producto o categoría. query: resumí lo que busca (ej: "ps5", "silla gamer", "notebook gamer").\n` +
    `- kind: MORE si pide más opciones de lo último.\n` +
    `- kind: PRICE si pide precio (si no especifica, usar lastQuery/lastResultsQuery como query).\n` +
    `- kind: INSTALLMENTS si habla de cuotas/financiación.\n` +
    `- kind: HUMAN si pide asesor/humano.\n` +
    `- kind: BUY_SIGNAL si quiere señar/reservar/comprar/coordinar.\n` +
    `- kind: UNKNOWN si no se entiende.\n` +
    `- Si menciona presupuesto o "barato", podés setear maxPriceArs aproximado si hay un número en ARS.\n` +
    `\nFormato JSON:\n` +
    `{"kind":"SEARCH|PRICE|INSTALLMENTS|HUMAN|MORE|UNKNOWN|BUY_SIGNAL","query":"...", "maxPriceArs":123456, "wantsInstallments":false, "confidence":0.0}`;

  const out = await chatCompletionText({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.1,
    max_tokens: 220
  });

  const parsed = safeJsonExtract(out);
  const validated = DecisionSchema.safeParse(parsed);
  if (!validated.success) {
    return { kind: 'UNKNOWN', usedReasoning: true };
  }

  const v = validated.data;
  return {
    kind: v.kind,
    query: (v.query ?? undefined) || undefined,
    maxPriceArs: (v.maxPriceArs ?? undefined) || undefined,
    wantsInstallments: (v.wantsInstallments ?? undefined) || undefined,
    confidence: (v.confidence ?? undefined) || undefined,
    usedReasoning: true
  };
}

export async function rewriteWithChat(params: {
  baseText: string;
  customerText: string;
  nameHint?: string;
  lastQuery?: string;
  usedProducts?: Array<{ name: string; price?: string; url?: string }>; // optional guardrails
}): Promise<string> {
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return params.baseText;

  const model = (env.OPENAI_MODEL_CHAT || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

  const guardProducts = (params.usedProducts && params.usedProducts.length)
    ? `\nProductos permitidos (NO inventar otros):\n${params.usedProducts
        .slice(0, 12)
        .map((p, i) => `${i + 1}. ${p.name}${p.price ? ` | ${p.price}` : ''}${p.url ? ` | ${p.url}` : ''}`)
        .join('\n')}\n`
    : '';

  const system =
    'Sos un asistente de ventas por WhatsApp. Reescribí el mensaje de salida para que suene humano, claro y breve. ' +
    'Mantené EXACTAMENTE los precios, links y nombres de productos si aparecen. ' +
    'No agregues productos que no estén en la lista permitida. ' +
    'No inventes stock ni promociones.';

  const user =
    `Mensaje del cliente: "${params.customerText}"\n` +
    `Nombre (si hay): ${params.nameHint || ''}\n` +
    `Última búsqueda (si hay): ${params.lastQuery || ''}\n` +
    guardProducts +
    `\nMensaje base a reescribir (conservar datos):\n---\n${params.baseText}\n---\n`;

  const out = await chatCompletionText({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.4,
    max_tokens: 450
  });

  // If model returns something weird, keep base.
  const cleaned = (out || '').trim();
  if (!cleaned) return params.baseText;
  return cleaned;
}
