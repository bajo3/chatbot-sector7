import { loadCatalog, type CatalogItem } from "../catalog/catalog.repo.js";

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function searchProductsFromJson(query: string, limit = 3): CatalogItem[] {
  const q = norm(query);

  const items = loadCatalog();

  // score simple: match en name > category > id
  const scored = items.map((it) => {
    const name = norm(it.name ?? "");
    const cat = norm(it.category ?? "");
    const id = norm(it.id ?? "");

    let score = 0;
    if (q && name.includes(q)) score += 3;
    if (q && cat.includes(q)) score += 2;
    if (q && id.includes(q)) score += 1;

    // si query vacío, penalizá
    if (!q) score -= 10;

    return { it, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.it);
}
