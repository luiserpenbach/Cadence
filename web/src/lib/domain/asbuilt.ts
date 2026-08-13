import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { getConfigBom } from "../impact";
import { consumeLot, findLotByCode, restockLot } from "./inventory";
import { resolveConfig } from "./resolution";

export type AsBuiltResult = { ok: true } | { ok: false; error: string };

export function recordAsBuilt(
  db: Db,
  input: {
    articleId: string;
    partRevisionId: string;
    qty: number;
    serialOrLot: string;
    runId?: string;
    by?: string;
    consume?: boolean;
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

  const lot = input.serialOrLot
    ? findLotByCode(db, input.partRevisionId, input.serialOrLot)
    : undefined;
  const shouldConsume = input.consume !== false && Boolean(lot);

  try {
    db.transaction((tx) => {
      if (shouldConsume && lot) {
        const consumed = consumeLot(tx, {
          lotId: lot.id,
          qty: input.qty,
          by: input.by ?? "as-built",
          reason: `Install on ${article.serial}`,
          kind: "issue",
          refType: "as_built",
          refId: article.id,
        });
        if (!consumed.ok) throw new Error(consumed.error);
      }
      tx.insert(s.asBuiltLines)
        .values({
          id: id("ab"),
          articleId: input.articleId,
          runId: input.runId ?? null,
          partRevisionId: input.partRevisionId,
          qty: input.qty,
          serialOrLot: input.serialOrLot,
          lotId: shouldConsume && lot ? lot.id : null,
        })
        .run();
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to record as-built." };
  }
  return { ok: true };
}

export function reverseAsBuilt(
  db: Db,
  input: { asBuiltId: string; by: string },
): AsBuiltResult {
  const line = db
    .select()
    .from(s.asBuiltLines)
    .where(eq(s.asBuiltLines.id, input.asBuiltId))
    .get();
  if (!line) return { ok: false, error: "As-built line not found." };

  try {
    db.transaction((tx) => {
      if (line.lotId) {
        const restocked = restockLot(tx, {
          lotId: line.lotId,
          qty: line.qty,
          by: input.by,
          reason: "Reverse as-built",
          refType: "as_built",
          refId: line.id,
        });
        if (!restocked.ok) throw new Error(restocked.error);
      }
      tx.delete(s.asBuiltLines).where(eq(s.asBuiltLines.id, line.id)).run();
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reverse as-built." };
  }
  return { ok: true };
}

export type AsBuiltDelta = {
  configId: string | null;
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

function designedConfigForArticle(
  db: Db,
  articleId: string,
): { id: string; key: string } | null {
  const latestRun = db
    .select()
    .from(s.runs)
    .where(eq(s.runs.articleId, articleId))
    .orderBy(desc(s.runs.createdAt))
    .all()[0];
  if (latestRun) {
    const config = db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, latestRun.articleConfigId))
      .get();
    if (config) return { id: config.id, key: config.key };
  }

  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, articleId))
    .get();
  if (!article) return null;
  const stand =
    db.select().from(s.stands).all()[0] ??
    ({ id: "", key: "" } as { id: string; key: string });
  const resolution = resolveConfig(db, "article", {
    articleId: article.id,
    articleSerial: article.serial,
    standId: stand.id,
  });
  if (resolution.outcome === "resolved") {
    return { id: resolution.config.id, key: resolution.config.key };
  }
  return null;
}

// As-designed (latest bound run, else the live resolved article config) vs
// as-built. CONCEPT §5: rapid iteration lives in the deltas between views.
export function diffAsBuilt(db: Db, articleId: string): AsBuiltDelta | null {
  const designed = designedConfigForArticle(db, articleId);
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

  if (!designed && builtRows.length === 0) return null;

  const designedPins = designed ? getConfigBom(designed.id) : [];

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
  const designedByRev = new Map(designedPins.map((d) => [d.partRevisionId, d]));

  for (const d of designedPins) {
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

  return {
    configId: designed?.id ?? null,
    configKey: designed?.key ?? "no covering config",
    lines,
  };
}
