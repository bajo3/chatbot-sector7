// Avoid relying on Prisma named exports at runtime (ESM/CJS interop).
// We only need a subset of fields to format messages.

/**
 * Anti-loop for handoff messaging.
 * IMPORTANT: we persist the ack timestamp into conversation.context so it survives restarts.
 */
const HANDOFF_ACK_TTL_MS = 1000 * 60 * 60; // 1 hour

export type ProductLike = {
  title: string;
  priceArs: number;
  inStock: boolean;
  productUrl?: string | null;
};

export type CatalogItemLike = {
  id: string;
  name: string;
  price?: number;
  price_raw?: string;
  url?: string;
  image?: string;
  category?: string;
  updated_at?: string;
};

export function formatProductLine(p: ProductLike, idx: number) {
  const price = `$${p.priceArs.toLocaleString("es-AR")}`;
  const stock = p.inStock ? "" : " (sin stock)";
  const link = p.productUrl ? `\n${p.productUrl}` : "";
  return `${idx}) ${p.title}${stock}\n${price}${link}`;
}

export function buildSearchReply(products: any[], query: string) {
  if (products.length === 0) {
    const q = (query || "").toLowerCase();
    // Mensaje más honesto cuando el usuario pide algo que no está cargado en el catálogo
    if (/(auric|auricular|auriculares|headset|cascos)/i.test(q)) {
      return [
        `No me figura *auriculares* en el catálogo que tengo cargado ahora.`,
        `Si querés, decime otra cosa para buscar (ej: *PS5*, *Nintendo Switch*, *silla gamer*, *cables HDMI*, *juegos*).`
      ].join("\n");
    }

    return `No encontré algo exacto para “${query}”.\nDecime *qué categoría* o un *modelo/marca* y te paso opciones.`;
  }

  const lines = products
    .map((p, i) => {
      const price =
        p?.price != null
          ? `$${Number(p.price).toLocaleString("es-AR")}`
          : p?.price_raw ?? "";

      return `${i + 1}) ${p?.name ?? "Producto"}${
        price ? ` — ${price}` : ""
      }`;
    })
    .join("\n");

  return `Te paso opciones de *${query}*:\n\n${lines}\n\nRespondé con el *número* y te paso el link + foto.`;
}

function formatARS(n?: number) {
  if (n == null) return "";
  return n.toLocaleString("es-AR");
}

function formatCatalogLine(p: CatalogItemLike, n: number) {
  const price = p.price != null ? `$${formatARS(p.price)}` : p.price_raw ?? "";
  const cat = p.category ? ` (${p.category})` : "";
  return `${n}) ${p.name}${cat}${price ? ` — ${price}` : ""}`;
}

export function buildInstallmentsReply() {
  return [
    "Sí, trabajamos con *tarjetas Visa y Mastercard*.",
    "Tenemos *3 y 6 cuotas sin interés* (según banco/promos vigentes).",
    "Pasame qué producto te interesa y si preferís *3* o *6* y te guío."
  ].join(" ");
}

export function buildAskClarify() {
  return "¿Qué estás buscando? Si me decís *modelo / marca* o para qué lo necesitás, te paso opciones y precios.";
}

export function buildWelcome() {
  return [
    "¡Hola! Soy el asistente de Sector 7 👋",
    "Decime qué querés ver y te paso opciones al toque.",
    "",
    "Ejemplos: *PS5*, *Nintendo Switch*, *silla gamer*, *cable HDMI*, *juegos*.",
  ].join("\n");
}

export function buildSoftClose() {
  return "Si querés, te lo armo *contado* o *en cuotas* (3/6 sin interés con Visa/Mastercard).";
}

/**
 * Returns the handoff message only once per conversation per TTL window.
 * After that, it falls back to a normal bot continuation (ask clarify),
 * to avoid repeating and "getting stuck".
 */
export function buildHandoffMsg(conversationId: string, context?: any) {
  const now = Date.now();
  // Optional chaining cannot be used on the LHS of an assignment in TypeScript.
  // We still want to mutate the passed-in context object when provided.
  const root: any = context ?? {};
  if (!root.bot || typeof root.bot !== 'object') root.bot = {};
  const bot = root.bot as any;

  const lastAck = typeof bot.handoffAckTs === 'number' ? bot.handoffAckTs : undefined;
  if (lastAck && now - lastAck < HANDOFF_ACK_TTL_MS) {
    // Already acknowledged recently → do NOT repeat handoff message
    return buildAskClarify();
  }

  bot.handoffAckTs = now;
  bot.handoffRequestedAt = bot.handoffRequestedAt ?? new Date(now).toISOString();

  return [
    "Perfecto 🙌 te paso con un asesor para cerrarlo rápido.",
    "Mientras tanto, decime tu *nombre* y *zona* y qué producto querés.",
  ].join(" ");
}

export function buildAfterHoursCapture() {
  // Si querés “sin horarios”, idealmente NO usar esta función.
  return [
    "Estoy fuera de horario de asesores, pero te ayudo igual.",
    "Dejame tu *nombre* y *zona* y qué producto querés, y mañana te escriben con todo listo.",
  ].join("\n");
}
