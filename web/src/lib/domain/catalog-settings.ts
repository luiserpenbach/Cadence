import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import {
  MAX_PART_NUMBER_DIGITS,
  MIN_PART_NUMBER_DIGITS,
  type CatalogPrefix,
} from "../catalog-format";

export {
  latestRevision,
  nextPartNumber,
  MAX_PART_NUMBER_DIGITS,
  MIN_PART_NUMBER_DIGITS,
} from "../catalog-format";
export type { CatalogPrefix } from "../catalog-format";

export const CATALOG_SETTINGS_ID = "default";

export type CatalogSettings = {
  categories: string[];
  prefixes: CatalogPrefix[];
};

export type CatalogSettingsResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function getCatalogSettings(db: Db): CatalogSettings | null {
  const row = db
    .select()
    .from(s.catalogSettings)
    .where(eq(s.catalogSettings.id, CATALOG_SETTINGS_ID))
    .get();
  if (!row) return null;
  return {
    categories: parseCategories(row.categoriesJson),
    prefixes: parsePrefixes(row.prefixesJson),
  };
}

/** Create a settings row from existing part categories if none exists. */
export function ensureCatalogSettings(db: Db): CatalogSettings {
  const existing = getCatalogSettings(db);
  if (existing) return existing;

  const parts = db.select({ category: s.parts.category }).from(s.parts).all();
  const categories = uniqueCategories([
    ...parts.map((p) => p.category),
    "hardware",
  ]).sort((a, b) => a.localeCompare(b));
  const settings: CatalogSettings = { categories, prefixes: [] };
  db.insert(s.catalogSettings)
    .values({
      id: CATALOG_SETTINGS_ID,
      categoriesJson: JSON.stringify(categories),
      prefixesJson: "[]",
    })
    .run();
  return settings;
}

export function saveCatalogSettings(
  db: Db,
  input: { categories: string[]; prefixes: CatalogPrefix[] },
): CatalogSettingsResult<{ settings: CatalogSettings }> {
  const categories: string[] = [];
  const seenCat = new Set<string>();
  for (const raw of input.categories) {
    const category = raw.trim();
    if (!category) continue;
    const key = category.toLowerCase();
    if (seenCat.has(key)) {
      return { ok: false, error: `Duplicate category "${category}".` };
    }
    seenCat.add(key);
    categories.push(category);
  }

  const prefixes: CatalogPrefix[] = [];
  const seenPrefix = new Set<string>();
  for (const raw of input.prefixes) {
    const prefix = raw.prefix.trim();
    if (!prefix) continue;
    const key = prefix.toLowerCase();
    if (seenPrefix.has(key)) {
      return { ok: false, error: `Duplicate prefix "${prefix}".` };
    }
    const length = Number(raw.length);
    if (
      !Number.isInteger(length) ||
      length < MIN_PART_NUMBER_DIGITS ||
      length > MAX_PART_NUMBER_DIGITS
    ) {
      return {
        ok: false,
        error: `Digit length for "${prefix}" must be an integer from ${MIN_PART_NUMBER_DIGITS} to ${MAX_PART_NUMBER_DIGITS}.`,
      };
    }
    seenPrefix.add(key);
    prefixes.push({ prefix, length });
  }

  const settings: CatalogSettings = { categories, prefixes };
  const row = db
    .select({ id: s.catalogSettings.id })
    .from(s.catalogSettings)
    .where(eq(s.catalogSettings.id, CATALOG_SETTINGS_ID))
    .get();
  if (row) {
    db.update(s.catalogSettings)
      .set({
        categoriesJson: JSON.stringify(categories),
        prefixesJson: JSON.stringify(prefixes),
      })
      .where(eq(s.catalogSettings.id, CATALOG_SETTINGS_ID))
      .run();
  } else {
    db.insert(s.catalogSettings)
      .values({
        id: CATALOG_SETTINGS_ID,
        categoriesJson: JSON.stringify(categories),
        prefixesJson: JSON.stringify(prefixes),
      })
      .run();
  }
  return { ok: true, settings };
}

/** Returns an error if the category is not in the configured list. */
export function categoryNotAllowed(
  db: Db,
  category: string,
  current?: string,
): string | null {
  const settings = getCatalogSettings(db);
  if (!settings || settings.categories.length === 0) return null;
  const trimmed = category.trim();
  if (current !== undefined && trimmed === current) return null;
  if (settings.categories.includes(trimmed)) return null;
  return `Category "${trimmed}" is not in the catalog list. Configure categories in Catalog settings.`;
}

function parseCategories(json: string): string[] {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return uniqueCategories(raw.filter((v): v is string => typeof v === "string"));
  } catch {
    return [];
  }
}

function parsePrefixes(json: string): CatalogPrefix[] {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: CatalogPrefix[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const rec = item as { prefix?: unknown; length?: unknown };
      if (typeof rec.prefix !== "string") continue;
      const prefix = rec.prefix.trim();
      if (!prefix) continue;
      const key = prefix.toLowerCase();
      if (seen.has(key)) continue;
      const length = Number(rec.length);
      if (
        !Number.isInteger(length) ||
        length < MIN_PART_NUMBER_DIGITS ||
        length > MAX_PART_NUMBER_DIGITS
      ) {
        continue;
      }
      seen.add(key);
      out.push({ prefix, length });
    }
    return out;
  } catch {
    return [];
  }
}

function uniqueCategories(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const category = raw.trim();
    if (!category) continue;
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(category);
  }
  return out;
}
