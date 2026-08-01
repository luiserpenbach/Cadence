import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { nextVersion } from "../version";

export type ProcedureResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function createProcedure(
  db: Db,
  input: { key: string; title: string; body: string },
): ProcedureResult<{ procedureId: string }> {
  const duplicate = db
    .select({ id: s.procedures.id })
    .from(s.procedures)
    .where(eq(s.procedures.key, input.key))
    .get();
  if (duplicate) {
    return { ok: false, error: `Procedure key "${input.key}" already exists.` };
  }

  const procedureId = id("proc");
  db.insert(s.procedures)
    .values({
      id: procedureId,
      key: input.key,
      title: input.title,
      body: input.body,
      version: "A",
    })
    .run();
  return { ok: true, procedureId };
}

export function createTestDefinition(
  db: Db,
  input: { key: string; name: string; description: string; appliesTo: string },
): ProcedureResult<{ testDefinitionId: string }> {
  const duplicate = db
    .select({ id: s.testDefinitions.id })
    .from(s.testDefinitions)
    .where(eq(s.testDefinitions.key, input.key))
    .get();
  if (duplicate) {
    return { ok: false, error: `Test key "${input.key}" already exists.` };
  }

  const testDefinitionId = id("tdef");
  db.insert(s.testDefinitions)
    .values({
      id: testDefinitionId,
      key: input.key,
      name: input.name,
      description: input.description,
      appliesTo: input.appliesTo,
    })
    .run();
  return { ok: true, testDefinitionId };
}

// Editing a procedure creates a new (key, version) row. Draft configs move to
// the new version; released/superseded configs keep pointing at the exact
// text they released with.
export function reviseProcedure(
  db: Db,
  input: { procedureId: string; title: string; body: string },
): ProcedureResult<{ procedureId: string; version: string }> {
  const current = db
    .select()
    .from(s.procedures)
    .where(eq(s.procedures.id, input.procedureId))
    .get();
  if (!current) return { ok: false, error: "Procedure not found." };

  const latest = db
    .select({ version: s.procedures.version })
    .from(s.procedures)
    .where(eq(s.procedures.key, current.key))
    .orderBy(desc(s.procedures.version))
    .all()
    .map((p) => p.version)
    .sort((a, b) => (a.length - b.length) || a.localeCompare(b))
    .at(-1)!;
  const version = nextVersion(latest);

  const newId = id("proc");
  db.transaction((tx) => {
    tx.insert(s.procedures)
      .values({
        id: newId,
        key: current.key,
        title: input.title,
        body: input.body,
        version,
      })
      .run();

    // Relink links owned by draft configs (any version of this key)
    const sameKeyIds = tx
      .select({ id: s.procedures.id })
      .from(s.procedures)
      .where(eq(s.procedures.key, current.key))
      .all()
      .map((p) => p.id)
      .filter((pid) => pid !== newId);
    if (sameKeyIds.length > 0) {
      const links = tx
        .select({
          id: s.configProcedures.id,
          configId: s.configProcedures.configId,
        })
        .from(s.configProcedures)
        .where(inArray(s.configProcedures.procedureId, sameKeyIds))
        .all();
      for (const link of links) {
        const config = tx
          .select({ status: s.configurations.status })
          .from(s.configurations)
          .where(eq(s.configurations.id, link.configId))
          .get();
        if (config?.status === "draft") {
          tx.update(s.configProcedures)
            .set({ procedureId: newId })
            .where(eq(s.configProcedures.id, link.id))
            .run();
        }
      }
    }
  });

  return { ok: true, procedureId: newId, version };
}
