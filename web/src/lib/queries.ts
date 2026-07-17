import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import * as s from "../db/schema";

export type VerificationGap = {
  testDefinitionId: string;
  key: string;
  name: string;
  source: "article" | "stand";
  status: "missing" | "fail" | "stale" | "waived";
  detail: string;
};

export type VerificationReport = {
  gaps: VerificationGap[];
  passes: Array<{ key: string; name: string; source: "article" | "stand" }>;
  acknowledged: boolean;
  ackBy: string | null;
  ackReason: string;
};

export function getRunVerification(runId: string): VerificationReport {
  const db = getDb();
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
  if (!run) {
    return {
      gaps: [],
      passes: [],
      acknowledged: false,
      ackBy: null,
      ackReason: "",
    };
  }

  const articleTests = db
    .select({
      id: s.testDefinitions.id,
      key: s.testDefinitions.key,
      name: s.testDefinitions.name,
    })
    .from(s.configRequiredTests)
    .innerJoin(
      s.testDefinitions,
      eq(s.configRequiredTests.testDefinitionId, s.testDefinitions.id),
    )
    .where(eq(s.configRequiredTests.configId, run.articleConfigId))
    .all()
    .map((t) => ({ ...t, source: "article" as const }));

  const standTests = db
    .select({
      id: s.testDefinitions.id,
      key: s.testDefinitions.key,
      name: s.testDefinitions.name,
    })
    .from(s.configRequiredTests)
    .innerJoin(
      s.testDefinitions,
      eq(s.configRequiredTests.testDefinitionId, s.testDefinitions.id),
    )
    .where(eq(s.configRequiredTests.configId, run.standConfigId))
    .all()
    .map((t) => ({ ...t, source: "stand" as const }));

  const required = [...articleTests, ...standTests];
  const results = db
    .select()
    .from(s.testResults)
    .where(eq(s.testResults.runId, runId))
    .all();
  const resultByTest = new Map(results.map((r) => [r.testDefinitionId, r]));

  const waiverRows =
    results.length > 0
      ? db.select().from(s.waivers).where(eq(s.waivers.runId, runId)).all()
      : [];
  const waived = new Set(waiverRows.map((w) => w.testDefinitionId));

  const gaps: VerificationGap[] = [];
  const passes: VerificationReport["passes"] = [];

  for (const t of required) {
    const res = resultByTest.get(t.id);
    if (!res) {
      if (waived.has(t.id)) {
        gaps.push({
          testDefinitionId: t.id,
          key: t.key,
          name: t.name,
          source: t.source,
          status: "waived",
          detail: "Waived",
        });
      } else {
        gaps.push({
          testDefinitionId: t.id,
          key: t.key,
          name: t.name,
          source: t.source,
          status: "missing",
          detail: "No result recorded",
        });
      }
      continue;
    }
    if (res.status === "pass") {
      passes.push({ key: t.key, name: t.name, source: t.source });
    } else if (res.status === "fail") {
      gaps.push({
        testDefinitionId: t.id,
        key: t.key,
        name: t.name,
        source: t.source,
        status: "fail",
        detail: res.notes || res.value || "Failed",
      });
    } else if (res.status === "stale") {
      gaps.push({
        testDefinitionId: t.id,
        key: t.key,
        name: t.name,
        source: t.source,
        status: "stale",
        detail: "Marked stale after config change",
      });
    } else if (res.status === "waived") {
      gaps.push({
        testDefinitionId: t.id,
        key: t.key,
        name: t.name,
        source: t.source,
        status: "waived",
        detail: res.notes || "Waived",
      });
    }
  }

  return {
    gaps,
    passes,
    acknowledged: run.gapAcknowledged,
    ackBy: run.gapAckBy,
    ackReason: run.gapAckReason,
  };
}

export function listConfigs() {
  return getDb().select().from(s.configurations).all();
}

export function getConfigBundle(configId: string) {
  const db = getDb();
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, configId))
    .get();
  if (!config) return null;

  const bom = db
    .select({
      id: s.configBomLines.id,
      qty: s.configBomLines.qty,
      findNumber: s.configBomLines.findNumber,
      notes: s.configBomLines.notes,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
      name: s.parts.name,
      partRevisionId: s.partRevisions.id,
    })
    .from(s.configBomLines)
    .innerJoin(
      s.partRevisions,
      eq(s.configBomLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(eq(s.configBomLines.configId, configId))
    .all();

  const tests = db
    .select({
      id: s.testDefinitions.id,
      key: s.testDefinitions.key,
      name: s.testDefinitions.name,
      description: s.testDefinitions.description,
    })
    .from(s.configRequiredTests)
    .innerJoin(
      s.testDefinitions,
      eq(s.configRequiredTests.testDefinitionId, s.testDefinitions.id),
    )
    .where(eq(s.configRequiredTests.configId, configId))
    .all();

  const procedures = db
    .select({
      id: s.procedures.id,
      key: s.procedures.key,
      title: s.procedures.title,
      version: s.procedures.version,
      body: s.procedures.body,
    })
    .from(s.configProcedures)
    .innerJoin(
      s.procedures,
      eq(s.configProcedures.procedureId, s.procedures.id),
    )
    .where(eq(s.configProcedures.configId, configId))
    .all();

  const effectivity = db
    .select()
    .from(s.configEffectivity)
    .where(eq(s.configEffectivity.configId, configId))
    .all();

  const effectivityIds = effectivity.map((e) => e.id);
  const explicitArticles =
    effectivityIds.length > 0
      ? db
          .select({
            effectivityId: s.configEffectivityArticles.effectivityId,
            serial: s.articles.serial,
            name: s.articles.name,
          })
          .from(s.configEffectivityArticles)
          .innerJoin(
            s.articles,
            eq(s.configEffectivityArticles.articleId, s.articles.id),
          )
          .where(inArray(s.configEffectivityArticles.effectivityId, effectivityIds))
          .all()
      : [];

  return { config, bom, tests, procedures, effectivity, explicitArticles };
}
