import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db";
import * as s from "../../db/schema";
import { compareSerials } from "../serial";

export type ExecutionContext = {
  articleId: string;
  articleSerial: string;
  standId: string;
};

// Does any effectivity row of `configId` cover the (article, stand) context?
export function configCovers(
  db: DbOrTx,
  configId: string,
  ctx: ExecutionContext,
): boolean {
  const rows = db
    .select()
    .from(s.configEffectivity)
    .where(eq(s.configEffectivity.configId, configId))
    .all();

  return rows.some((row) => {
    const standOk = row.anyStand || row.standId === ctx.standId;
    if (!standOk) return false;

    if (row.anyArticle) {
      if (row.serialFrom && compareSerials(ctx.articleSerial, row.serialFrom) < 0) {
        return false;
      }
      if (row.serialTo && compareSerials(ctx.articleSerial, row.serialTo) > 0) {
        return false;
      }
      return true;
    }

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
    return Boolean(link);
  });
}
