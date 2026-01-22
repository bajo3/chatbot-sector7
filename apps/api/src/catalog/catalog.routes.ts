import { Router } from "express";
import { loadCatalog } from "./catalog.repo";

export const catalogRouter = Router();

/**
 * GET /catalog/search?q=...&category=...&limit=...
 */
catalogRouter.get("/search", (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const category = String(req.query.category ?? "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 8) || 8, 20);

  const items = loadCatalog();

  const filtered = items.filter((it) => {
    const name = (it.name ?? "").toLowerCase();
    const cat = (it.category ?? "").toLowerCase();

    const matchQ = !q || name.includes(q) || it.id.toLowerCase().includes(q);
    const matchCat = !category || cat === category;

    return matchQ && matchCat;
  });

  // Orden simple: más nuevo primero si existe updated_at, si no, por name
  filtered.sort((a, b) => {
    const da = a.updated_at ? Date.parse(a.updated_at) : 0;
    const db = b.updated_at ? Date.parse(b.updated_at) : 0;
    if (db !== da) return db - da;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  res.json({
    ok: true,
    count: filtered.length,
    items: filtered.slice(0, limit),
  });
});

/**
 * GET /catalog/:id
 */
catalogRouter.get("/:id", (req, res) => {
  const id = String(req.params.id);
  const items = loadCatalog();
  const item = items.find((x) => x.id === id);

  if (!item) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  return res.json({ ok: true, item });
});
