import { prisma } from '../db/prisma.js';

// Derive a strongly-typed Product row from Prisma, without importing model types.
type ProductRow = Awaited<ReturnType<typeof prisma.product.findMany>>[number];

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
}

function tokenize(q: string) {
  return norm(q).split(/[^a-z0-9]+/g).filter(w => w.length >= 2);
}

export async function searchProducts(query: string, limit = 3) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const all: ProductRow[] = await prisma.product.findMany({ where: { }, take: 2000 });
  const scored = all
    .map((p: ProductRow) => {
    const hay = norm([p.title, p.category, p.tags].filter(Boolean).join(' '));
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 3;
    if (p.inStock) score += 2;
    score += Math.min(5, p.popularity) * 0.2;
    // slight preference if title has all tokens
    if (tokens.every(t => norm(p.title).includes(t))) score += 2;
    return { p, score };
  })
    .filter((x: { p: ProductRow; score: number }) => x.score > 0);

  scored.sort((a: { p: ProductRow; score: number }, b: { p: ProductRow; score: number }) => b.score - a.score);

  // ensure diversity: avoid 3 identical titles
  const out: Array<{ p: ProductRow; score: number }> = [];
  const seen = new Set<string>();
  for (const s of scored) {
    const key = norm(s.p.title);
    if (seen.has(key)) continue;
    out.push(s);
    seen.add(key);
    if (out.length >= limit) break;
  }
  return out.map((x: { p: ProductRow; score: number }) => x.p);
}
