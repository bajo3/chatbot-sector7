import { loadCatalog, type CatalogItem } from "../catalog/catalog.repo.js";

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
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

  const scored = items
    .map((it) => {
      const name = norm(it.name ?? "");
      const cat = norm(it.category ?? "");
      const id = norm(it.id ?? "");

      let score = 0;
      if (q && name.includes(q)) score += 3;
      if (q && cat.includes(q)) score += 2;
      if (q && id.includes(q)) score += 1;

      // extra: split query words
      const words = q.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        const hit = words.reduce((acc, w) => acc + (name.includes(w) ? 1 : 0), 0);
        score += Math.min(2, hit);
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
