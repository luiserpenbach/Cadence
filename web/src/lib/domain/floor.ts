import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { resolveConfig, type Resolution } from "./resolution";

type Configuration = typeof s.configurations.$inferSelect;

export type FloorView = {
  article: typeof s.articles.$inferSelect;
  stand: typeof s.stands.$inferSelect;
  articleResolution: Resolution;
  standResolution: Resolution;
  // The article's last run, for "what changed since you last touched this"
  lastRun: typeof s.runs.$inferSelect | null;
  lastRunArticleConfig: Configuration | null;
  // Set when the resolved article config differs from the last run's
  changedSinceLastRun: boolean;
};

// One screen for the floor: given (article, stand), what is the current
// recipe, and did it change since the last run on this article?
export function getFloorView(
  db: Db,
  articleId: string,
  standId: string,
): FloorView | null {
  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, articleId))
    .get();
  const stand = db
    .select()
    .from(s.stands)
    .where(eq(s.stands.id, standId))
    .get();
  if (!article || !stand) return null;

  const ctx = {
    articleId: article.id,
    articleSerial: article.serial,
    standId: stand.id,
  };
  const articleResolution = resolveConfig(db, "article", ctx);
  const standResolution = resolveConfig(db, "stand", ctx);

  const lastRun =
    db
      .select()
      .from(s.runs)
      .where(eq(s.runs.articleId, article.id))
      .orderBy(desc(s.runs.createdAt))
      .all()[0] ?? null;
  const lastRunArticleConfig = lastRun
    ? (db
        .select()
        .from(s.configurations)
        .where(eq(s.configurations.id, lastRun.articleConfigId))
        .get() ?? null)
    : null;

  const changedSinceLastRun = Boolean(
    lastRun &&
      articleResolution.outcome === "resolved" &&
      articleResolution.config.id !== lastRun.articleConfigId,
  );

  return {
    article,
    stand,
    articleResolution,
    standResolution,
    lastRun,
    lastRunArticleConfig,
    changedSinceLastRun,
  };
}
