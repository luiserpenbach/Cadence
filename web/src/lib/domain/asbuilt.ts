import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { getConfigBom } from "../impact";

export type AsBuiltResult = { ok: true } | { ok: false; error: string };

export function recordAsBuilt(
  db: Db,
  input: {
    articleId: string;
    partRevisionId: string;
    qty: number;
    serialOrLot: string;
    runId?: string;
  },
): AsBuiltResult {
  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, input.articleId))
    .get();
  if (!article) return { ok: false, error: "Article not found." };

  const rev = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.id, input.partRevisionId))
    .get();
  if (!rev) return { ok: false, error: "Part revision not found." };
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };

  if (input.runId) {
    const run = db
      .select()
      .from(s.runs)
      .where(eq(s.runs.id, input.runId))
      .get();
    if (!run) return { ok: false, error: "Run not found." };
    if (run.articleId !== input.articleId) {
      return { ok: false, error: "Run is bound to a different article." };
    }
  }

  db.insert(s.asBuiltLines)
    .values({
      id: id("ab"),
      articleId: input.articleId,
      runId: input.runId ?? null,
      partRevisionId: input.partRevisionId,
      qty: input.qty,
      serialOrLot: input.serialOrLot,
    })
    .run();
  return { ok: true };
}

export type AsBuiltDelta = {
  configId: string;
  configKey: string;
  lines: Array<{
    kind: "missing" | "extra" | "qty_mismatch";
    partNumber: string;
    revision: string;
    name: string;
    designedQty: number;
    builtQty: number;
  }>;
};

// As-designed (the article's latest bound config BoM) vs as-built (recorded
// lines, summed per part revision). CONCEPT §5: rapid iteration lives in the
// deltas between the four views.
export function diffAsBuilt(db: Db, articleId: string): AsBuiltDelta | null {
  const latestRun = db
    .select()
    .from(s.runs)
    .where(eq(s.runs.articleId, articleId))
    .orderBy(desc(s.runs.createdAt))
    .all()[0];
  if (!latestRun) return null;

  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, latestRun.articleConfigId))
    .get();
  if (!config) return null;

  const designed = getConfigBom(config.id);

  const builtRows = db
    .select({
      partRevisionId: s.asBuiltLines.partRevisionId,
      qty: s.asBuiltLines.qty,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
      name: s.parts.name,
    })
    .from(s.asBuiltLines)
    .innerJoin(
      s.partRevisions,
      eq(s.asBuiltLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(eq(s.asBuiltLines.articleId, articleId))
    .all();

  const builtByRev = new Map<
    string,
    { qty: number; partNumber: string; revision: string; name: string }
  >();
  for (const row of builtRows) {
    const existing = builtByRev.get(row.partRevisionId);
    if (existing) {
      existing.qty += row.qty;
    } else {
      builtByRev.set(row.partRevisionId, {
        qty: row.qty,
        partNumber: row.partNumber,
        revision: row.revision,
        name: row.name,
      });
    }
  }

  const lines: AsBuiltDelta["lines"] = [];
  const designedByRev = new Map(designed.map((d) => [d.partRevisionId, d]));

  for (const d of designed) {
    const built = builtByRev.get(d.partRevisionId);
    if (!built) {
      lines.push({
        kind: "missing",
        partNumber: d.partNumber,
        revision: d.revision,
        name: d.name,
        designedQty: d.qty,
        builtQty: 0,
      });
    } else if (built.qty !== d.qty) {
      lines.push({
        kind: "qty_mismatch",
        partNumber: d.partNumber,
        revision: d.revision,
        name: d.name,
        designedQty: d.qty,
        builtQty: built.qty,
      });
    }
  }
  for (const [revId, built] of builtByRev) {
    if (!designedByRev.has(revId)) {
      lines.push({
        kind: "extra",
        partNumber: built.partNumber,
        revision: built.revision,
        name: built.name,
        designedQty: 0,
        builtQty: built.qty,
      });
    }
  }

  return { configId: config.id, configKey: config.key, lines };
}
