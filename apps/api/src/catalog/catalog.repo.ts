import fs from "node:fs";
import path from "node:path";

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

const CATALOG_PATH = path.join(process.cwd(), "src", "catalog", "catalog.json");

export function loadCatalog(): CatalogItem[] {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("catalog.json debe ser un array");
  return data as CatalogItem[];
}
