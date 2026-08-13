import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

export type CutConfigInput = {
  basedOnId: string;
  key: string;
  name: string;
  riskClass: string;
  program?: string;
  envelope?: string;
  applyLatestRevs?: boolean;
};

export type CutConfigResult =
  | { ok: true; configId: string; swapped: Array<{ findNumber: string; partNumber: string; fromRev: string; toRev: string }> }
  | { ok: false; error: string };

function sortRevs(a: string, b: string) {
  return a.length - b.length || a.localeCompare(b);
}

function latestRevForPart(
  db: { select: Db["select"] } | Db,
  partId: string,
): typeof s.partRevisions.$inferSelect | undefined {
  const revs = (db as Db)
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.partId, partId))
    .all();
  return revs.sort((x, y) => sortRevs(x.revision, y.revision)).at(-1);
}

// Copies BoM pins, required tests, procedures, and effectivity (including
// explicit article links) from the base config into a new draft, atomically.
// When applyLatestRevs is set, pins that have a newer catalog rev are swapped.
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
  const swapped: Array<{
    findNumber: string;
    partNumber: string;
    fromRev: string;
    toRev: string;
  }> = [];
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
        program: (input.program?.trim() || base.program).trim(),
        envelope: (input.envelope?.trim() || base.envelope).trim(),
        notes: `Cut from ${base.key}`,
      })
      .run();

    const bom = tx
      .select()
      .from(s.configBomLines)
      .where(eq(s.configBomLines.configId, input.basedOnId))
      .all();
    for (const line of bom) {
      let pinRevId = line.partRevisionId;
      let notes = line.notes;
      if (input.applyLatestRevs) {
        const current = tx
          .select()
          .from(s.partRevisions)
          .where(eq(s.partRevisions.id, line.partRevisionId))
          .get();
        if (current) {
          const latest = latestRevForPart(tx as unknown as Db, current.partId);
          if (latest && latest.id !== current.id) {
            const part = tx
              .select()
              .from(s.parts)
              .where(eq(s.parts.id, current.partId))
              .get();
            swapped.push({
              findNumber: line.findNumber,
              partNumber: part?.partNumber ?? current.partId,
              fromRev: current.revision,
              toRev: latest.revision,
            });
            pinRevId = latest.id;
            notes = [notes, `cut-in ${current.revision}→${latest.revision}`]
              .filter(Boolean)
              .join(" · ");
          }
        }
      }
      const newBomId = id("bom");
      tx.insert(s.configBomLines)
        .values({
          id: newBomId,
          configId: newId,
          partRevisionId: pinRevId,
          qty: line.qty,
          findNumber: line.findNumber,
          notes,
        })
        .run();
      const alts = tx
        .select()
        .from(s.configBomAlternates)
        .where(eq(s.configBomAlternates.bomLineId, line.id))
        .all();
      for (const alt of alts) {
        tx.insert(s.configBomAlternates)
          .values({
            id: id("alt"),
            bomLineId: newBomId,
            partRevisionId: alt.partRevisionId,
          })
          .run();
      }
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

    if (input.applyLatestRevs) {
      const cutNote = swapped.length
        ? `Cut from ${base.key} · swapped ${swapped
            .map((x) => `${x.partNumber} ${x.fromRev}→${x.toRev}`)
            .join(", ")}`
        : `Cut from ${base.key} · pins already at latest rev`;
      tx.update(s.configurations)
        .set({ notes: cutNote })
        .where(eq(s.configurations.id, newId))
        .run();
    }
  });

  return { ok: true, configId: newId, swapped };
}
