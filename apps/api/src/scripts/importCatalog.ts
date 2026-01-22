import { prisma } from '../db/prisma.js';
import fs from 'fs';
import path from 'path';

type CatalogItem = {
  id: string;
  title: string;
  category?: string;
  priceArs: number;
  priceUsd?: number | null;
  inStock?: boolean;
  imageUrl?: string;
  productUrl?: string;
  tags?: string;
  popularity?: number;
};

async function main() {
  const file = process.argv[2] || path.join(process.cwd(), 'data', 'catalog.sample.json');
  const raw = fs.readFileSync(file, 'utf-8');
  const items = JSON.parse(raw) as CatalogItem[];

  let ok = 0, fail = 0;
  for (const it of items) {
    try {
      if (!it.id || !it.title || typeof it.priceArs !== 'number') throw new Error('Missing required fields');
      await prisma.product.upsert({
        where: { id: it.id },
        create: {
          id: it.id,
          title: it.title,
          category: it.category,
          priceArs: Math.round(it.priceArs),
          priceUsd: it.priceUsd ?? null,
          inStock: it.inStock ?? true,
          imageUrl: it.imageUrl,
          productUrl: it.productUrl,
          tags: it.tags,
          popularity: it.popularity ?? 0
        },
        update: {
          title: it.title,
          category: it.category,
          priceArs: Math.round(it.priceArs),
          priceUsd: it.priceUsd ?? null,
          inStock: it.inStock ?? true,
          imageUrl: it.imageUrl,
          productUrl: it.productUrl,
          tags: it.tags,
          popularity: it.popularity ?? 0
        }
      });
      ok++;
    } catch (e) {
      console.error('Failed item', it?.id, e);
      fail++;
    }
  }

  console.log(`Import done. ok=${ok} fail=${fail}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
