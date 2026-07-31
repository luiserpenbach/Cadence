import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

export type CutConfigInput = {
  basedOnId: string;
  key: string;
  name: string;
  riskClass: string;
};

export type CutConfigResult =
  | { ok: true; configId: string }
  | { ok: false; error: string };

// Copies BoM pins, required tests, procedures, and effectivity (including
// explicit article links) from the base config into a new draft, atomically.
export function cutConfiguration(db: Db, input: CutConfigInput): CutConfigResult {
  const base = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.basedOnId))
    .get();
  if (!base) return { ok: false, error: "Base configuration not found." };

  const duplicate = db
    .select({ id: s.configurations.id })
    .from(s.configurations)
    .where(eq(s.configurations.key, input.key))
    .get();
  if (duplicate) {
    return { ok: false, error: `Config key "${input.key}" already exists.` };
  }

  const newId = id("cfg");
  db.transaction((tx) => {
    tx.insert(s.configurations)
      .values({
        id: newId,
        key: input.key,
        name: input.name,
        kind: base.kind,
        status: "draft",
        riskClass: input.riskClass,
        basedOnConfigId: input.basedOnId,
        notes: `Cut from ${base.key}`,
      })
      .run();

    const bom = tx
      .select()
      .from(s.configBomLines)
      .where(eq(s.configBomLines.configId, input.basedOnId))
      .all();
    for (const line of bom) {
      tx.insert(s.configBomLines)
        .values({
          id: id("bom"),
          configId: newId,
          partRevisionId: line.partRevisionId,
          qty: line.qty,
          findNumber: line.findNumber,
          notes: line.notes,
        })
        .run();
    }

    const tests = tx
      .select()
      .from(s.configRequiredTests)
      .where(eq(s.configRequiredTests.configId, input.basedOnId))
      .all();
    for (const t of tests) {
      tx.insert(s.configRequiredTests)
        .values({
          id: id("crt"),
          configId: newId,
          testDefinitionId: t.testDefinitionId,
        })
        .run();
    }

    const procs = tx
      .select()
      .from(s.configProcedures)
      .where(eq(s.configProcedures.configId, input.basedOnId))
      .all();
    for (const p of procs) {
      tx.insert(s.configProcedures)
        .values({
          id: id("cpr"),
          configId: newId,
          procedureId: p.procedureId,
        })
        .run();
    }

    const effectivity = tx
      .select()
      .from(s.configEffectivity)
      .where(eq(s.configEffectivity.configId, input.basedOnId))
      .all();
    for (const e of effectivity) {
      const newEffId = id("eff");
      tx.insert(s.configEffectivity)
        .values({
          id: newEffId,
          configId: newId,
          articleScope: e.articleScope,
          serialFrom: e.serialFrom,
          serialTo: e.serialTo,
          standScope: e.standScope,
          standId: e.standId,
        })
        .run();

      const links = tx
        .select()
        .from(s.configEffectivityArticles)
        .where(eq(s.configEffectivityArticles.effectivityId, e.id))
        .all();
      for (const link of links) {
        tx.insert(s.configEffectivityArticles)
          .values({
            id: id("efa"),
            effectivityId: newEffId,
            articleId: link.articleId,
          })
          .run();
      }
    }
  });

  return { ok: true, configId: newId };
}
