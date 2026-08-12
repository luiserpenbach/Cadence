import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { getConfigBom } from "../impact";
import { addBomLine, updateBomLine } from "./config-edit";

export type BomCsvLine = {
  findNumber: string;
  partNumber: string;
  revision: string;
  qty: number;
  notes: string;
};

export type ParseResult =
  | { ok: true; lines: BomCsvLine[] }
  | { ok: false; error: string };

const HEADER = "find,part,rev,qty,notes";

export function parseBomCsv(text: string): ParseResult {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!raw) return { ok: false, error: "CSV is empty." };
  const rows = raw.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (rows.length === 0) return { ok: false, error: "CSV is empty." };

  const header = rows[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    find: header.indexOf("find"),
    part: header.indexOf("part"),
    rev: header.indexOf("rev"),
    qty: header.indexOf("qty"),
    notes: header.indexOf("notes"),
  };
  if (idx.part < 0 || idx.rev < 0 || idx.qty < 0 || idx.find < 0) {
    return {
      ok: false,
      error: `Header must include find, part, rev, qty (got: ${rows[0]}).`,
    };
  }

  const lines: BomCsvLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = splitCsvRow(rows[i]);
    const partNumber = (cols[idx.part] ?? "").trim();
    const revision = (cols[idx.rev] ?? "").trim();
    const qty = Number(cols[idx.qty] ?? "");
    if (!partNumber || !revision) {
      return { ok: false, error: `Row ${i + 1}: part and rev are required.` };
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: `Row ${i + 1}: qty must be a positive number.` };
    }
    const findNumber = (cols[idx.find] ?? "").trim();
    if (!findNumber) {
      return { ok: false, error: `Row ${i + 1}: find number is required.` };
    }
    if (lines.some((l) => l.findNumber === findNumber)) {
      return { ok: false, error: `Row ${i + 1}: duplicate find number ${findNumber}.` };
    }
    lines.push({
      findNumber,
      partNumber,
      revision,
      qty,
      notes: idx.notes >= 0 ? (cols[idx.notes] ?? "").trim() : "",
    });
  }
  if (lines.length === 0) return { ok: false, error: "CSV has a header but no pins." };
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

export function exportBomCsv(configId: string): string | null {
  const bom = getConfigBom(configId);
  const lines = [...bom].sort((a, b) => a.findNumber.localeCompare(b.findNumber));
  const rows = [HEADER];
  for (const line of lines) {
    rows.push(
      [
        csvCell(line.findNumber),
        csvCell(line.partNumber),
        csvCell(line.revision),
        String(line.qty),
        csvCell(line.notes ?? ""),
      ].join(","),
    );
  }
  return rows.join("\n") + "\n";
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function importBomCsv(
  db: Db,
  input: { configId: string; csv: string },
): { ok: true; added: number; updated: number } | { ok: false; error: string } {
  const parsed = parseBomCsv(input.csv);
  if (!parsed.ok) return parsed;

  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "draft") {
    return { ok: false, error: "Only draft configs can import a BoM." };
  }

  const existing = db
    .select()
    .from(s.configBomLines)
    .where(eq(s.configBomLines.configId, input.configId))
    .all();
  const byFind = new Map(
    existing.filter((l) => l.findNumber).map((l) => [l.findNumber, l]),
  );

  let added = 0;
  let updated = 0;
  for (const line of parsed.lines) {
    const part = db
      .select()
      .from(s.parts)
      .where(eq(s.parts.partNumber, line.partNumber))
      .get();
    if (!part) {
      return { ok: false, error: `Unknown part "${line.partNumber}".` };
    }
    const rev = db
      .select()
      .from(s.partRevisions)
      .where(eq(s.partRevisions.partId, part.id))
      .all()
      .find((r) => r.revision === line.revision);
    if (!rev) {
      return {
        ok: false,
        error: `Unknown revision ${line.partNumber} @ ${line.revision}.`,
      };
    }

    const match = line.findNumber ? byFind.get(line.findNumber) : undefined;
    if (match) {
      const result = updateBomLine(db, {
        configId: input.configId,
        bomLineId: match.id,
        partRevisionId: rev.id,
        qty: line.qty,
        findNumber: line.findNumber,
        notes: line.notes,
      });
      if (!result.ok) return result;
      updated++;
    } else {
      const result = addBomLine(db, {
        configId: input.configId,
        partRevisionId: rev.id,
        qty: line.qty,
        findNumber: line.findNumber,
        notes: line.notes,
      });
      if (!result.ok) return result;
      added++;
    }
  }
  return { ok: true, added, updated };
}
