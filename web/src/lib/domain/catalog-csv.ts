import type { Db } from "../../db";
import { createPart } from "./authoring";

export type CatalogCsvLine = {
  partNumber: string;
  name: string;
  revision: string;
  category: string;
  sourcing: string;
  kind: string;
  description: string;
};

export type ParseCatalogResult =
  | { ok: true; lines: CatalogCsvLine[] }
  | { ok: false; error: string };

const SOURCING = new Set(["make", "buy", "cots"]);
const KINDS = new Set(["component", "assembly"]);

export function parseCatalogCsv(text: string): ParseCatalogResult {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!raw) return { ok: false, error: "CSV is empty." };
  const rows = raw.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"));
  const header = rows[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    part: header.indexOf("part"),
    name: header.indexOf("name"),
    rev: header.indexOf("rev") >= 0 ? header.indexOf("rev") : header.indexOf("revision"),
    category: header.indexOf("category"),
    sourcing: header.indexOf("sourcing"),
    kind: header.indexOf("kind"),
    description: header.indexOf("description"),
  };
  if (idx.part < 0 || idx.name < 0) {
    return { ok: false, error: "Header must include part, name (got: " + rows[0] + ")." };
  }
  const lines: CatalogCsvLine[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const cols = splitCsvRow(rows[i]);
    const partNumber = (cols[idx.part] ?? "").trim();
    const name = (cols[idx.name] ?? "").trim();
    if (!partNumber || !name) {
      return { ok: false, error: `Row ${i + 1}: part and name are required.` };
    }
    if (seen.has(partNumber)) {
      return { ok: false, error: `Row ${i + 1}: duplicate part ${partNumber}.` };
    }
    seen.add(partNumber);
    const sourcing = ((idx.sourcing >= 0 ? cols[idx.sourcing] : "") || "buy").trim().toLowerCase();
    const kind = ((idx.kind >= 0 ? cols[idx.kind] : "") || "component").trim().toLowerCase();
    if (!SOURCING.has(sourcing)) {
      return { ok: false, error: `Row ${i + 1}: sourcing must be make, buy, or cots.` };
    }
    if (!KINDS.has(kind)) {
      return { ok: false, error: `Row ${i + 1}: kind must be component or assembly.` };
    }
    lines.push({
      partNumber,
      name,
      revision: ((idx.rev >= 0 ? cols[idx.rev] : "") || "A").trim() || "A",
      category: ((idx.category >= 0 ? cols[idx.category] : "") || "hardware").trim() || "hardware",
      sourcing,
      kind,
      description: idx.description >= 0 ? (cols[idx.description] ?? "").trim() : "",
    });
  }
  if (lines.length === 0) return { ok: false, error: "CSV has a header but no parts." };
  return { ok: true, lines };
}

function splitCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function importCatalogCsv(
  db: Db,
  csv: string,
): { ok: true; added: number; skipped: string[] } | { ok: false; error: string } {
  const parsed = parseCatalogCsv(csv);
  if (!parsed.ok) return parsed;
  const skipped: string[] = [];
  let added = 0;
  for (const line of parsed.lines) {
    const result = createPart(db, line);
    if (!result.ok) skipped.push(`${line.partNumber}: ${result.error}`);
    else added++;
  }
  if (added === 0) {
    return { ok: false, error: skipped[0] ?? "No parts imported." };
  }
  return { ok: true, added, skipped };
}
