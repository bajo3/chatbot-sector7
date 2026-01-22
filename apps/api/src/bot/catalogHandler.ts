import { loadCatalog } from "../catalog/catalog.repo.js";

function formatARS(n?: number) {
  if (!n && n !== 0) return "";
  return n.toLocaleString("es-AR");
}

export function maybeHandleCatalog(text: string) {
  const t = (text || "").trim().toLowerCase();

  // Intención simple (podemos mejorar luego)
  const wantsCatalog =
    t === "catalogo" || t === "catálogo" ||
    t.startsWith("catalogo ") || t.startsWith("catálogo ") ||
    t.includes("catalogo") || t.includes("catálogo") ||
    t.includes("sillas") || t.includes("mouse") || t.includes("teclado") || t.includes("auricular");

  if (!wantsCatalog) return null;

  // Categoría detectada (hoy simple)
  let category: string | null = null;
  if (t.includes("silla")) category = "sillas";
  if (t.includes("mouse")) category = "mouse";
  if (t.includes("teclado")) category = "teclados";
  if (t.includes("auricular") || t.includes("headset")) category = "auriculares";

  const items = loadCatalog()
    .filter((x) => {
      if (!category) return true;
      return (x.category || "").toLowerCase() === category;
    })
    .slice(0, 8);

  if (items.length === 0) {
    return {
      text: category
        ? `No encontré productos en la categoría "${category}". Decime qué buscás (ej: sillas / teclados / mouse / auriculares).`
        : `No encontré productos. Decime qué buscás (ej: sillas / teclados / mouse / auriculares).`
    };
  }

  const lines = items.map((it, idx) => {
    const price = it.price != null ? `$${formatARS(it.price)}` : (it.price_raw ?? "");
    return `${idx + 1}) ${it.name}${price ? ` — ${price}` : ""}`;
  });

  const title = category ? `📦 ${category.toUpperCase()}` : `📦 CATÁLOGO`;
  return {
    text:
      `${title}\n\n` +
      lines.join("\n") +
      `\n\nRespondé con el *número* y te paso link + foto.`
  };
}
