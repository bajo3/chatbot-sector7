import { loadCatalog, type CatalogItem } from "../catalog/catalog.repo.js";

function norm(s: string) {
  // Normalización "search-friendly":
  // - minúsculas
  // - sin tildes
  // - convierte cualquier símbolo/puntuación en espacio
  // - colapsa espacios
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string, limit = 3): number {
  // Implementación con corte temprano (suficiente para catálogo chico)
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);

  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;

  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    const ca = a.charCodeAt(i - 1);
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = cur[0];

    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      const v = Math.min(del, ins, sub);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }

    prev = cur;
    if (rowMin > limit) return limit + 1;
  }

  return prev[lb];
}

function wordFuzzyHit(word: string, text: string): boolean {
  if (!word || !text) return false;
  if (text.includes(word)) return true;

  // fuzzy: comparar contra tokens del nombre/categoría
  const tokens = text.split(/\s+/).filter(Boolean);
  const wlen = word.length;
  // Allow a tiny amount of fuzziness.
  // WhatsApp queries often include short typos (e.g. "illa" vs "silla") so we
  // permit distance=1 for length>=4.
  const limit = wlen >= 10 ? 3 : wlen >= 7 ? 2 : wlen >= 5 ? 1 : wlen >= 4 ? 1 : 0;
  if (limit === 0) return false;

  for (const t of tokens) {
    if (Math.abs(t.length - wlen) > limit) continue;
    if (levenshtein(word, t, limit) <= limit) return true;
  }
  return false;
}

function expandSynonyms(words: string[]): string[] {
  const out = new Set<string>(words);
  const has = (w: string) => out.has(w);

  // Lightweight synonym/alias expansion tuned for electronics retail in AR.
  // Keep it conservative to avoid noise.
  const addAll = (arr: string[]) => arr.forEach((x) => x && out.add(x));

  if (has('consola') || has('consolas')) addAll(['ps5', 'playstation', 'xbox', 'nintendo', 'switch']);
  if (has('nintendo') || has('nintendos') || has('nintento')) addAll(['nintendo', 'switch']);
  if (has('play') || has('playstation')) addAll(['ps5', 'playstation']);
  if (has('joystick') || has('control')) addAll(['joystick', 'control', 'dualshock', 'dualsense']);
  if (has('auriculares') || has('auricular') || has('headset') || has('cascos')) addAll(['auriculares', 'headset']);
  if (has('silla') || has('gamer')) addAll(['silla', 'gamer']);

  return Array.from(out);
}

function parsePriceArs(it: CatalogItem): number | null {
  if (typeof it.price === 'number' && Number.isFinite(it.price) && it.price > 0) return it.price;
  const raw = it.price_raw || '';
  const m = raw.match(/\$\s?([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,})/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/\./g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type SearchOpts = {
  offset?: number;
  maxPriceArs?: number;
};

export function searchProductsFromJson(query: string, limit = 3, opts: SearchOpts = {}): CatalogItem[] {
  const q = norm(query);
  const offset = Math.max(0, opts.offset ?? 0);
  const maxPrice = opts.maxPriceArs && opts.maxPriceArs > 0 ? opts.maxPriceArs : null;

  const items = loadCatalog();

  const baseWords = q.split(/\s+/).filter(Boolean);
  const words = expandSynonyms(baseWords);

  const scored = items
    .map((it) => {
      const name = norm(it.name ?? "");
      const cat = norm(it.category ?? "");
      const id = norm(it.id ?? "");

      let score = 0;
      if (q && name.includes(q)) score += 3;
      if (q && cat.includes(q)) score += 2;
      if (q && id.includes(q)) score += 1;

      // extra: split query words (incluye fuzzy para typos)
      if (words.length) {
        const hit = words.reduce((acc, w) => acc + (wordFuzzyHit(w, name) ? 1 : 0), 0);
        const hitCat = words.reduce((acc, w) => acc + (wordFuzzyHit(w, cat) ? 1 : 0), 0);
        score += Math.min(3, hit + Math.min(1, hitCat));
      }

      const price = parsePriceArs(it);
      if (maxPrice && price) {
        // slight boost if within budget, slight penalty if far
        if (price <= maxPrice) score += 1;
        else score -= Math.min(3, Math.ceil((price - maxPrice) / Math.max(1, maxPrice / 3)));
      }

      return { it, score, price };
    })
    .filter((x) => x.score > 0);

  const filtered = maxPrice
    ? scored.filter((x) => {
        // Keep unknown prices, but prefer those in budget
        if (!x.price) return true;
        return x.price <= maxPrice * 1.2;
      })
    : scored;

  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(offset, offset + limit)
    .map((x) => x.it);
}
