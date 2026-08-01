import { and, eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

export type WaiverInput = {
  runId: string;
  testDefinitionId: string;
  reason: string;
  approvedBy: string;
};

export type WaiverResult = { ok: true } | { ok: false; error: string };

export function createWaiver(db: Db, input: WaiverInput): WaiverResult {
  const run = db.select().from(s.runs).where(eq(s.runs.id, input.runId)).get();
  if (!run) return { ok: false, error: "Run not found." };

  const testDef = db
    .select()
    .from(s.testDefinitions)
    .where(eq(s.testDefinitions.id, input.testDefinitionId))
    .get();
  if (!testDef) return { ok: false, error: "Test definition not found." };

  const existing = db
    .select({ id: s.waivers.id })
    .from(s.waivers)
    .where(
      and(
        eq(s.waivers.runId, input.runId),
        eq(s.waivers.testDefinitionId, input.testDefinitionId),
      ),
    )
    .get();
  if (existing) {
    return { ok: false, error: `${testDef.key} is already waived on this run.` };
  }

  db.insert(s.waivers)
    .values({
      id: id("wvr"),
      runId: input.runId,
      testDefinitionId: input.testDefinitionId,
      reason: input.reason,
      approvedBy: input.approvedBy,
    })
    .run();

  return { ok: true };
}
