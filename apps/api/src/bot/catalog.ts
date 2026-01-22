import { prisma } from '../db/prisma.js';

// Tipo inferido desde Prisma (sin depender de @prisma/client)
type ProductRow = Awaited<ReturnType<typeof prisma.product.findMany>>[number];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function tokenize(q: string): string[] {
  return norm(q).split(/[^a-z0-9]+/g).filter((w: string) => w.length >= 2);
}

export async function searchProducts(query: string, limit = 3): Promise<ProductRow[]> {
  const tokens: string[] = tokenize(query);
  if (tokens.length === 0) return [];

  const all: ProductRow[] = await prisma.product.findMany({ take: 2000 });

  const scored: Array<{ p: ProductRow; score: number }> = all
    .map((p: ProductRow) => {
      // tags puede ser string o string[] según tu schema → lo normalizamos a string
      const tagsText =
        Array.isArray((p as any).tags) ? (p as any).tags.join(' ') : ((p as any).tags ?? '');

      const hay = norm([p.title, (p as any).category ?? '', tagsText].join(' '));

      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score += 3;

      if ((p as any).inStock) score += 2;

      const popularity = typeof (p as any).popularity === 'number' ? (p as any).popularity : 0;
      score += Math.min(5, popularity) * 0.2;

      if (tokens.every((t: string) => norm(p.title).includes(t))) score += 2;

      return { p, score };
    })
    .filter((x: { p: ProductRow; score: number }) => x.score > 0);

  scored.sort(
    (a: { p: ProductRow; score: number }, b: { p: ProductRow; score: number }) => b.score - a.score
  );

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
