import { eq, inArray } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

export type RevCutInResult =
  | {
      ok: true;
      drafts: Array<{ configId: string; key: string; fromKey: string }>;
    }
  | { ok: false; error: string };

function uniqueKey(db: Db, wanted: string): string {
  let candidate = wanted;
  let n = 2;
  while (
    db
      .select({ id: s.configurations.id })
      .from(s.configurations)
      .where(eq(s.configurations.key, candidate))
      .get()
  ) {
    candidate = `${wanted}-${n++}`;
  }
  return candidate;
}

// One-shot rev cut-in: given a new part revision, find every RELEASED config
// pinning a different revision of the same part and cut a draft of each with
// the pin swapped (qty/find preserved). The RE reviews effectivity and
// releases; nothing is auto-released.
export function cutInRevision(
  db: Db,
  input: { partRevisionId: string; riskClass: string },
): RevCutInResult {
  const newRev = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.id, input.partRevisionId))
    .get();
  if (!newRev) return { ok: false, error: "Part revision not found." };

  const siblingRevIds = db
    .select({ id: s.partRevisions.id })
    .from(s.partRevisions)
    .where(eq(s.partRevisions.partId, newRev.partId))
    .all()
    .map((r) => r.id)
    .filter((rid) => rid !== newRev.id);
  if (siblingRevIds.length === 0) {
    return { ok: false, error: "No prior revisions of this part are pinned anywhere." };
  }

  const pinnedLines = db
    .select({
      configId: s.configBomLines.configId,
    })
    .from(s.configBomLines)
    .where(inArray(s.configBomLines.partRevisionId, siblingRevIds))
    .all();
  const configIds = [...new Set(pinnedLines.map((l) => l.configId))];
  const targets =
    configIds.length > 0
      ? db
          .select()
          .from(s.configurations)
          .where(inArray(s.configurations.id, configIds))
          .all()
          .filter((c) => c.status === "released")
      : [];
  if (targets.length === 0) {
    return {
      ok: false,
      error: "No released config pins a prior revision of this part.",
    };
  }

  const drafts: Array<{ configId: string; key: string; fromKey: string }> = [];

  db.transaction((tx) => {
    for (const base of targets) {
      const newId = id("cfg");
      const key = uniqueKey(db, `${base.key}-${newRev.revision}`);

      tx.insert(s.configurations)
        .values({
          id: newId,
          key,
          name: `${base.name} (rev ${newRev.revision} cut-in)`,
          kind: base.kind,
          status: "draft",
          riskClass: input.riskClass,
          basedOnConfigId: base.id,
          notes: `Rev cut-in from ${base.key}: pins moved to rev ${newRev.revision}`,
        })
        .run();

      const bom = tx
        .select()
        .from(s.configBomLines)
        .where(eq(s.configBomLines.configId, base.id))
        .all();
      for (const line of bom) {
        const newBomId = id("bom");
        tx.insert(s.configBomLines)
          .values({
            id: newBomId,
            configId: newId,
            partRevisionId: siblingRevIds.includes(line.partRevisionId)
              ? newRev.id
              : line.partRevisionId,
            qty: line.qty,
            findNumber: line.findNumber,
            notes: line.notes,
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
        .where(eq(s.configRequiredTests.configId, base.id))
        .all();
      for (const t of tests) {
        tx.insert(s.configRequiredTests)
          .values({ id: id("crt"), configId: newId, testDefinitionId: t.testDefinitionId })
          .run();
      }

      const procs = tx
        .select()
        .from(s.configProcedures)
        .where(eq(s.configProcedures.configId, base.id))
        .all();
      for (const p of procs) {
        tx.insert(s.configProcedures)
          .values({ id: id("cpr"), configId: newId, procedureId: p.procedureId })
          .run();
      }

      const effectivity = tx
        .select()
        .from(s.configEffectivity)
        .where(eq(s.configEffectivity.configId, base.id))
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
            .values({ id: id("efa"), effectivityId: newEffId, articleId: link.articleId })
            .run();
        }
      }

      drafts.push({ configId: newId, key, fromKey: base.key });
    }
  });

  return { ok: true, drafts };
}
