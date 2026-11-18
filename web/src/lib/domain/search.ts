import { eq, or, sql, type AnyColumn } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";

export type SearchHit = {
  type:
    | "part"
    | "config"
    | "article"
    | "stand"
    | "run"
    | "kit"
    | "issue"
    | "lot"
    | "po"
    | "work order"
    | "procedure";
  label: string;
  sub: string;
  href: string;
};

const PER_TYPE = 6;

function rank(label: string, q: string): number {
  const l = label.toLowerCase();
  if (l === q) return 0;
  if (l.startsWith(q)) return 1;
  return 2;
}

// One query box over every identifier a person might have in their hand:
// part numbers, config keys, serials, run/kit/PO/WO numbers, lot codes,
// issue keys — plus names and titles. Exact and prefix matches rank first.
export function searchAll(db: Db, query: string, limit = 24): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const p = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const like = (col: AnyColumn, pattern: string) =>
    sql`${col} like ${pattern} escape '\\'`;
  const hits: SearchHit[] = [];

  for (const r of db
    .select()
    .from(s.parts)
    .where(or(like(s.parts.partNumber, p), like(s.parts.name, p)))
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "part",
      label: r.partNumber,
      sub: r.name,
      href: `/catalog/${r.id}`,
    });
  }
  for (const r of db
    .select()
    .from(s.configurations)
    .where(
      or(
        like(s.configurations.key, p),
        like(s.configurations.name, p),
        like(s.configurations.program, p),
      ),
    )
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "config",
      label: r.key,
      sub: `${r.name} · ${r.status.replace("_", " ")}`,
      href: `/configs/${r.id}`,
    });
  }
  for (const r of db
    .select()
    .from(s.articles)
    .where(or(like(s.articles.serial, p), like(s.articles.name, p)))
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "article",
      label: r.serial,
      sub: r.name,
      href: `/articles/${r.id}`,
    });
  }
  for (const r of db
    .select()
    .from(s.stands)
    .where(or(like(s.stands.key, p), like(s.stands.name, p)))
    .limit(PER_TYPE)
    .all()) {
    hits.push({ type: "stand", label: r.key, sub: r.name, href: "/stands" });
  }
  for (const r of db
    .select()
    .from(s.runs)
    .where(like(s.runs.key, p))
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "run",
      label: r.key,
      sub: r.status.replace("_", " "),
      href: `/runs/${r.id}`,
    });
  }
  for (const r of db
    .select()
    .from(s.kits)
    .where(like(s.kits.key, p))
    .limit(PER_TYPE)
    .all()) {
    hits.push({ type: "kit", label: r.key, sub: r.status, href: `/kits/${r.id}` });
  }
  for (const r of db
    .select()
    .from(s.issues)
    .where(or(like(s.issues.key, p), like(s.issues.title, p)))
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "issue",
      label: r.key,
      sub: `${r.title} · ${r.status}`,
      href: `/issues/${r.id}`,
    });
  }
  for (const r of db
    .select({
      lotCode: s.inventoryLots.lotCode,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
    })
    .from(s.inventoryLots)
    .innerJoin(
      s.partRevisions,
      eq(s.inventoryLots.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(like(s.inventoryLots.lotCode, p))
    .limit(PER_TYPE)
    .all()) {
    if (!r.lotCode) continue;
    hits.push({
      type: "lot",
      label: r.lotCode,
      sub: `${r.partNumber} @ ${r.revision}`,
      href: `/trace?q=${encodeURIComponent(r.lotCode)}`,
    });
  }
  for (const r of db
    .select()
    .from(s.purchaseOrders)
    .where(
      or(like(s.purchaseOrders.poNumber, p), like(s.purchaseOrders.supplier, p)),
    )
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "po",
      label: r.poNumber,
      sub: `${r.supplier} · ${r.status}`,
      href: "/procurement",
    });
  }
  for (const r of db
    .select()
    .from(s.workOrders)
    .where(like(s.workOrders.key, p))
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "work order",
      label: r.key,
      sub: r.status.replace("_", " "),
      href: "/inventory",
    });
  }
  for (const r of db
    .select()
    .from(s.procedures)
    .where(or(like(s.procedures.key, p), like(s.procedures.title, p)))
    .limit(PER_TYPE)
    .all()) {
    hits.push({
      type: "procedure",
      label: `${r.key} v${r.version}`,
      sub: r.title,
      href: "/procedures",
    });
  }

  return hits
    .map((h, i) => ({ h, i, r: rank(h.label, q) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.h);
}
