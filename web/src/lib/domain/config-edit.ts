import { and, eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

export type EditResult = { ok: true } | { ok: false; error: string };

// CONCEPT §3: configs are cheap to create, gated to release. Only drafts are
// mutable; released and superseded configs are immutable records.
function requireDraft(db: Db, configId: string): EditResult {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "draft") {
    return {
      ok: false,
      error: `Released configs are immutable — cut a new config instead (status: ${config.status}).`,
    };
  }
  return { ok: true };
}

export function addBomLine(
  db: Db,
  input: {
    configId: string;
    partRevisionId: string;
    qty: number;
    findNumber: string;
  },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  const rev = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.id, input.partRevisionId))
    .get();
  if (!rev) return { ok: false, error: "Part revision not found." };
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };

  db.insert(s.configBomLines)
    .values({
      id: id("bom"),
      configId: input.configId,
      partRevisionId: input.partRevisionId,
      qty: input.qty,
      findNumber: input.findNumber,
    })
    .run();
  return { ok: true };
}

export function removeBomLine(
  db: Db,
  input: { configId: string; bomLineId: string },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  db.delete(s.configBomLines)
    .where(
      and(
        eq(s.configBomLines.id, input.bomLineId),
        eq(s.configBomLines.configId, input.configId),
      ),
    )
    .run();
  return { ok: true };
}

export function addRequiredTest(
  db: Db,
  input: { configId: string; testDefinitionId: string },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  const testDef = db
    .select()
    .from(s.testDefinitions)
    .where(eq(s.testDefinitions.id, input.testDefinitionId))
    .get();
  if (!testDef) return { ok: false, error: "Test definition not found." };

  const existing = db
    .select({ id: s.configRequiredTests.id })
    .from(s.configRequiredTests)
    .where(
      and(
        eq(s.configRequiredTests.configId, input.configId),
        eq(s.configRequiredTests.testDefinitionId, input.testDefinitionId),
      ),
    )
    .get();
  if (existing) {
    return { ok: false, error: `${testDef.key} is already required.` };
  }

  db.insert(s.configRequiredTests)
    .values({
      id: id("crt"),
      configId: input.configId,
      testDefinitionId: input.testDefinitionId,
    })
    .run();
  return { ok: true };
}

export function removeRequiredTest(
  db: Db,
  input: { configId: string; testDefinitionId: string },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  db.delete(s.configRequiredTests)
    .where(
      and(
        eq(s.configRequiredTests.configId, input.configId),
        eq(s.configRequiredTests.testDefinitionId, input.testDefinitionId),
      ),
    )
    .run();
  return { ok: true };
}

export function addProcedureLink(
  db: Db,
  input: { configId: string; procedureId: string },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  const procedure = db
    .select()
    .from(s.procedures)
    .where(eq(s.procedures.id, input.procedureId))
    .get();
  if (!procedure) return { ok: false, error: "Procedure not found." };

  const existing = db
    .select({ id: s.configProcedures.id })
    .from(s.configProcedures)
    .where(
      and(
        eq(s.configProcedures.configId, input.configId),
        eq(s.configProcedures.procedureId, input.procedureId),
      ),
    )
    .get();
  if (existing) {
    return { ok: false, error: `${procedure.key} is already linked.` };
  }

  db.insert(s.configProcedures)
    .values({
      id: id("cpr"),
      configId: input.configId,
      procedureId: input.procedureId,
    })
    .run();
  return { ok: true };
}

export function removeProcedureLink(
  db: Db,
  input: { configId: string; procedureId: string },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  db.delete(s.configProcedures)
    .where(
      and(
        eq(s.configProcedures.configId, input.configId),
        eq(s.configProcedures.procedureId, input.procedureId),
      ),
    )
    .run();
  return { ok: true };
}

export function addEffectivityRow(
  db: Db,
  input: {
    configId: string;
    articleScope: "any" | "serial_range" | "explicit";
    serialFrom?: string;
    serialTo?: string;
    standScope: "any" | "explicit";
    standId?: string;
    explicitArticleIds: string[];
  },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  if (input.standScope === "explicit" && !input.standId) {
    return { ok: false, error: "Explicit stand scope requires a stand." };
  }
  if (
    input.articleScope === "serial_range" &&
    !input.serialFrom &&
    !input.serialTo
  ) {
    return { ok: false, error: "Serial range scope requires from and/or to." };
  }
  if (
    input.articleScope === "explicit" &&
    input.explicitArticleIds.length === 0
  ) {
    return { ok: false, error: "Explicit article scope requires articles." };
  }

  db.transaction((tx) => {
    const effId = id("eff");
    tx.insert(s.configEffectivity)
      .values({
        id: effId,
        configId: input.configId,
        articleScope: input.articleScope,
        serialFrom:
          input.articleScope === "serial_range" ? input.serialFrom : null,
        serialTo: input.articleScope === "serial_range" ? input.serialTo : null,
        standScope: input.standScope,
        standId: input.standScope === "explicit" ? input.standId : null,
      })
      .run();
    if (input.articleScope === "explicit") {
      for (const articleId of input.explicitArticleIds) {
        tx.insert(s.configEffectivityArticles)
          .values({ id: id("efa"), effectivityId: effId, articleId })
          .run();
      }
    }
  });
  return { ok: true };
}

export function removeEffectivityRow(
  db: Db,
  input: { configId: string; effectivityId: string },
): EditResult {
  const guard = requireDraft(db, input.configId);
  if (!guard.ok) return guard;

  const row = db
    .select()
    .from(s.configEffectivity)
    .where(
      and(
        eq(s.configEffectivity.id, input.effectivityId),
        eq(s.configEffectivity.configId, input.configId),
      ),
    )
    .get();
  if (!row) return { ok: false, error: "Effectivity row not found." };

  db.transaction((tx) => {
    tx.delete(s.configEffectivityArticles)
      .where(eq(s.configEffectivityArticles.effectivityId, row.id))
      .run();
    tx.delete(s.configEffectivity)
      .where(eq(s.configEffectivity.id, row.id))
      .run();
  });
  return { ok: true };
}
