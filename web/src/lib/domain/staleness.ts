import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { configCovers } from "./effectivity";

// CONCEPT §6: config N→N+1 marks impacted tests stale. For every run bound to
// the base config whose (article, stand) falls inside the new config's
// effectivity, passing results for tests required by BOTH configs get a
// system-recorded `stale` result. Failed/missing tests already warn.
export function propagateStaleness(db: DbOrTx, newConfigId: string): number {
  const newConfig = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, newConfigId))
    .get();
  if (!newConfig?.basedOnConfigId) return 0;
  const baseId = newConfig.basedOnConfigId;

  const requiredIds = (configId: string) =>
    db
      .select({ id: s.configRequiredTests.testDefinitionId })
      .from(s.configRequiredTests)
      .where(eq(s.configRequiredTests.configId, configId))
      .all()
      .map((r) => r.id);
  const baseTests = new Set(requiredIds(baseId));
  const sharedTests = requiredIds(newConfigId).filter((t) => baseTests.has(t));
  if (sharedTests.length === 0) return 0;

  const bindingColumn =
    newConfig.kind === "stand" ? s.runs.standConfigId : s.runs.articleConfigId;
  const boundRuns = db
    .select({
      id: s.runs.id,
      articleId: s.runs.articleId,
      standId: s.runs.standId,
      serial: s.articles.serial,
    })
    .from(s.runs)
    .innerJoin(s.articles, eq(s.runs.articleId, s.articles.id))
    .where(eq(bindingColumn, baseId))
    .all();

  let inserted = 0;
  for (const run of boundRuns) {
    const covered = configCovers(db, newConfigId, {
      articleId: run.articleId,
      articleSerial: run.serial,
      standId: run.standId,
    });
    if (!covered) continue;

    const results = db
      .select()
      .from(s.testResults)
      .where(
        and(
          eq(s.testResults.runId, run.id),
          inArray(s.testResults.testDefinitionId, sharedTests),
        ),
      )
      .orderBy(asc(s.testResults.recordedAt), asc(sql`rowid`))
      .all();
    const latestByTest = new Map(results.map((r) => [r.testDefinitionId, r]));

    for (const testId of sharedTests) {
      const latest = latestByTest.get(testId);
      if (latest?.status !== "pass") continue;
      db.insert(s.testResults)
        .values({
          id: id("tres"),
          runId: run.id,
          testDefinitionId: testId,
          status: "stale",
          value: "",
          notes: `Superseded by ${newConfig.key}`,
          recordedBy: "system",
        })
        .run();
      inserted++;
    }
  }
  return inserted;
}
