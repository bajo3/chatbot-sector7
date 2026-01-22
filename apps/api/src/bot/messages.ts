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
  return '¿Qué estás buscando? Si me decís *modelo / marca* o para qué lo necesitás, te paso opciones y precios.';
}

export function buildWelcome() {
  return [
    '¡Hola! Soy el asistente de Sector 7 👋',
    'Decime qué querés ver y te paso opciones al toque.',
    '',
    'Ejemplos: *PS5*, *silla gamer*, *notebook*, *auriculares*, *monitor*.'
  ].join('\n');
}

export function buildSoftClose() {
  return '¿Querés que te lo arme para contado o en cuotas?';
}

export function buildHandoffMsg() {
  return 'Perfecto 🙌 te paso con un asesor para cerrarlo rápido. Ya te escriben por acá.';
}

export function buildAfterHoursCapture() {
  return [
    'Estoy fuera de horario de asesores, pero te ayudo igual.',
    'Dejame tu *nombre* y *zona* y qué producto querés, y mañana te escriben con todo listo.'
  ].join('\n');
}
