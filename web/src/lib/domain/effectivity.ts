import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db";
import * as s from "../../db/schema";
import { compareSerials } from "../serial";

export type ExecutionContext = {
  articleId: string;
  articleSerial: string;
  standId: string;
};

// Specificity of a matching effectivity row (CONCEPT §4, most specific wins):
// 3 = article-specific AND stand-specific (exact)
// 2 = article-specific, any stand
// 1 = stand-specific, any article
// 0 = any article, any stand
export type SpecificityRank = 0 | 1 | 2 | 3;

type EffectivityRow = typeof s.configEffectivity.$inferSelect;

// Rank of a row for a context, or null when the row does not cover it.
export function rankEffectivityRow(
  db: DbOrTx,
  row: EffectivityRow,
  ctx: ExecutionContext,
): SpecificityRank | null {
  const standSpecific = row.standScope === "explicit";
  if (standSpecific && row.standId !== ctx.standId) return null;

  let articleSpecific = false;
  if (row.articleScope === "serial_range") {
    articleSpecific = true;
    if (row.serialFrom && compareSerials(ctx.articleSerial, row.serialFrom) < 0) {
      return null;
    }
    if (row.serialTo && compareSerials(ctx.articleSerial, row.serialTo) > 0) {
      return null;
    }
  } else if (row.articleScope === "explicit") {
    articleSpecific = true;
    const link = db
      .select({ id: s.configEffectivityArticles.id })
      .from(s.configEffectivityArticles)
      .where(
        and(
          eq(s.configEffectivityArticles.effectivityId, row.id),
          eq(s.configEffectivityArticles.articleId, ctx.articleId),
        ),
      )
      .get();
    if (!link) return null;
  }

  if (articleSpecific && standSpecific) return 3;
  if (articleSpecific) return 2;
  if (standSpecific) return 1;
  return 0;
}

// Best (highest) specificity with which `configId` covers the context, or
// null when no effectivity row covers it.
export function configRank(
  db: DbOrTx,
  configId: string,
  ctx: ExecutionContext,
): SpecificityRank | null {
  const rows = db
    .select()
    .from(s.configEffectivity)
    .where(eq(s.configEffectivity.configId, configId))
    .all();

  let best: SpecificityRank | null = null;
  for (const row of rows) {
    const rank = rankEffectivityRow(db, row, ctx);
    if (rank !== null && (best === null || rank > best)) best = rank;
  }
  return best;
}

export function configCovers(
  db: DbOrTx,
  configId: string,
  ctx: ExecutionContext,
): boolean {
  return configRank(db, configId, ctx) !== null;
}

// Article-axis coverage only (stand ignored). Used for "who stays on the
// prior config" and kit-count demand — a serial_range/explicit cut-in
// should not pretend to cover every article.
export function configCoversArticle(
  db: DbOrTx,
  configId: string,
  article: { id: string; serial: string },
): boolean {
  const rows = db
    .select()
    .from(s.configEffectivity)
    .where(eq(s.configEffectivity.configId, configId))
    .all();
  if (rows.length === 0) return false;

  for (const row of rows) {
    if (row.articleScope === "any") return true;
    if (row.articleScope === "serial_range") {
      if (row.serialFrom && compareSerials(article.serial, row.serialFrom) < 0) {
        continue;
      }
      if (row.serialTo && compareSerials(article.serial, row.serialTo) > 0) {
        continue;
      }
      return true;
    }
    if (row.articleScope === "explicit") {
      const link = db
        .select({ id: s.configEffectivityArticles.id })
        .from(s.configEffectivityArticles)
        .where(
          and(
            eq(s.configEffectivityArticles.effectivityId, row.id),
            eq(s.configEffectivityArticles.articleId, article.id),
          ),
        )
        .get();
      if (link) return true;
    }
  }
  return false;
}
