import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CatalogItem = {
  id: string;
  name: string;
  price_raw?: string;
  price?: number;
  image?: string;
  url?: string;
  category?: string;
  updated_at?: string;
};

// Resolve catalog.json robustly in both dev (tsx running from src/) and prod (node running from dist/)
// regardless of the process working directory.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveCatalogPath(): string {
  const candidates = [
    // 1) Same folder as this module (works in dev; can work in prod if you copy assets to dist)
    path.join(MODULE_DIR, "catalog.json"),
    // 2) When running from dist/, jump back to workspace root and use src/
    path.resolve(MODULE_DIR, "..", "..", "src", "catalog", "catalog.json"),
    // 3) Fallbacks based on cwd (covers some Railway/Nixpacks workdir layouts)
    path.join(process.cwd(), "src", "catalog", "catalog.json"),
    path.join(process.cwd(), "apps", "api", "src", "catalog", "catalog.json"),
  ];

  const hit = candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  if (!hit) {
    throw new Error(
      `No se encontró catalog.json. Probé: ${candidates.join(" | ")}`
    );
  }
  return hit;
}

export function loadCatalog(): CatalogItem[] {
  const raw = fs.readFileSync(resolveCatalogPath(), "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("catalog.json debe ser un array");
  return data as CatalogItem[];
}
