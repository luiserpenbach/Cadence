import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { getRunVerification } from "../queries";
import { resolveConfig, type Resolution } from "./resolution";

export type CreateRunInput = {
  articleId: string;
  standId: string;
};

export type CreateRunResult =
  | {
      ok: true;
      runId: string;
      articleConfigKey: string;
      standConfigKey: string;
    }
  | { ok: false; error: string };

function describeFailure(
  kind: "article" | "stand",
  resolution: Resolution,
): string | null {
  if (resolution.outcome === "none") {
    return `No released ${kind} config covers this (article, stand). Release one before binding a run.`;
  }
  if (resolution.outcome === "conflict") {
    const keys = resolution.candidates.map((c) => c.key).join(", ");
    return `Equal-specificity ${kind} config conflict: ${keys}. Resolve effectivity before binding.`;
  }
  return null;
}

// Binds a run by rule: the resolver picks the article and stand configs for
// the (article, stand) context. Conflicts and missing configs block creation.
export function createRun(db: Db, input: CreateRunInput): CreateRunResult {
  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, input.articleId))
    .get();
  if (!article) return { ok: false, error: "Article not found." };
  const stand = db
    .select()
    .from(s.stands)
    .where(eq(s.stands.id, input.standId))
    .get();
  if (!stand) return { ok: false, error: "Stand not found." };

  const ctx = {
    articleId: article.id,
    articleSerial: article.serial,
    standId: stand.id,
  };
  const articleResolution = resolveConfig(db, "article", ctx);
  const articleFailure = describeFailure("article", articleResolution);
  if (articleFailure) return { ok: false, error: articleFailure };

  const standResolution = resolveConfig(db, "stand", ctx);
  const standFailure = describeFailure("stand", standResolution);
  if (standFailure) return { ok: false, error: standFailure };

  if (
    articleResolution.outcome !== "resolved" ||
    standResolution.outcome !== "resolved"
  ) {
    return { ok: false, error: "Resolution failed." };
  }

  const count =
    db.select({ c: sql<number>`count(*)` }).from(s.runs).get()?.c ?? 0;
  const runId = id("run");
  db.insert(s.runs)
    .values({
      id: runId,
      key: `RUN-${String(count + 1).padStart(3, "0")}`,
      articleId: article.id,
      standId: stand.id,
      articleConfigId: articleResolution.config.id,
      standConfigId: standResolution.config.id,
      status: "planned",
    })
    .run();

  return {
    ok: true,
    runId,
    articleConfigKey: articleResolution.config.key,
    standConfigKey: standResolution.config.key,
  };
}

export type LifecycleResult = { ok: true } | { ok: false; error: string };

// Record-and-warn (CONCEPT §6): starting with open gaps requires an explicit
// acknowledgment first — warn, never silently proceed.
export function startRun(db: Db, runId: string): LifecycleResult {
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status !== "planned") {
    return { ok: false, error: `Only planned runs can start (status: ${run.status}).` };
  }

  const report = getRunVerification(runId);
  if (report.unacknowledgedCount > 0) {
    return {
      ok: false,
      error: `${report.unacknowledgedCount} unacknowledged gap(s). Acknowledge them to proceed (record-and-warn).`,
    };
  }

  db.update(s.runs)
    .set({ status: "in_progress", startedAt: new Date().toISOString() })
    .where(eq(s.runs.id, runId))
    .run();
  return { ok: true };
}

export function completeRun(db: Db, runId: string): LifecycleResult {
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status !== "in_progress") {
    return { ok: false, error: `Only in-progress runs can complete (status: ${run.status}).` };
  }

  db.update(s.runs)
    .set({ status: "complete", completedAt: new Date().toISOString() })
    .where(eq(s.runs.id, runId))
    .run();
  return { ok: true };
}
