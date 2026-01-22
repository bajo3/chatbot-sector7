// Avoid relying on Prisma named exports at runtime (ESM/CJS interop).
// We only need a subset of fields to format messages.
export type ProductLike = {
  title: string;
  priceArs: number;
  inStock: boolean;
  productUrl?: string | null;
};

export function formatProductLine(p: ProductLike, idx: number) {
  const price = `$${p.priceArs.toLocaleString('es-AR')}`;
  const stock = p.inStock ? '' : ' (sin stock)';
  const link = p.productUrl ? `\n${p.productUrl}` : '';
  return `${idx}) ${p.title}${stock}\n${price}${link}`;
}

export function buildSearchReply(products: ProductLike[], query: string) {
  if (products.length === 0) {
    return `No encontré algo exacto para “${query}”.\nDecime: marca/modelo o para qué lo necesitás y te paso opciones.`;
  }
  const lines = products.map((p,i)=>formatProductLine(p, i+1)).join('\n\n');
  return `Te paso 3 opciones de *${query}*:\n\n${lines}\n\nSi querés, te explico cuotas o te paso con un asesor.`;
}

export function buildInstallmentsReply() {
  return [
    'Sí, tenemos cuotas.',
    'Decime qué producto te interesa y tu idea (monto / cantidad de cuotas) y te lo calculo rápido.'
  ].join(' ');
}

export function buildAskClarify() {
  return '¿Qué estás buscando? Ej: “silla gamer”, “ps5”, “auriculares”.';
}

export function buildHandoffMsg() {
  return 'Dale, te paso con un asesor 🙌 Ya te escriben por acá.';
}

export function buildAfterHoursCapture() {
  return [
    'Estoy fuera de horario de asesores, pero te ayudo igual.',
    'Dejame tu *nombre* y *zona* y qué producto querés, y mañana te escriben con todo listo.'
  ].join('\n');
}
