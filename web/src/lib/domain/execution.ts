import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

// A procedure's steps are the non-empty lines of its (versioned, immutable)
// body; leading manual numbering like "1." or "3)" is stripped.
export function parseSteps(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter((line) => line.length > 0);
}

export type StartExecutionResult =
  | { ok: true; executionId: string }
  | { ok: false; error: string };

export function startExecution(
  db: Db,
  input: { runId: string; procedureId: string; by: string },
): StartExecutionResult {
  const run = db.select().from(s.runs).where(eq(s.runs.id, input.runId)).get();
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status !== "in_progress") {
    return {
      ok: false,
      error: `Start the run first — procedures execute on an in-progress run (status: ${run.status}).`,
    };
  }

  const procedure = db
    .select()
    .from(s.procedures)
    .where(eq(s.procedures.id, input.procedureId))
    .get();
  if (!procedure) return { ok: false, error: "Procedure not found." };
  if (parseSteps(procedure.body).length === 0) {
    return { ok: false, error: `${procedure.key} has no steps to execute.` };
  }

  const active = db
    .select({ id: s.procedureExecutions.id })
    .from(s.procedureExecutions)
    .where(
      and(
        eq(s.procedureExecutions.runId, input.runId),
        eq(s.procedureExecutions.procedureId, input.procedureId),
        eq(s.procedureExecutions.status, "in_progress"),
      ),
    )
    .get();
  if (active) {
    return { ok: false, error: `${procedure.key} already has an execution in progress on this run.` };
  }

  const executionId = id("exe");
  db.insert(s.procedureExecutions)
    .values({
      id: executionId,
      runId: input.runId,
      procedureId: input.procedureId,
      startedBy: input.by,
    })
    .run();
  return { ok: true, executionId };
}

export const stepOutcomes = ["done", "skipped", "flagged"] as const;
export type StepOutcome = (typeof stepOutcomes)[number];

export type RecordStepResult =
  | { ok: true; executionComplete: boolean }
  | { ok: false; error: string };

// Steps record strictly in order; skipping or flagging requires a note.
// Recording the last step completes the execution.
export function recordStep(
  db: Db,
  input: {
    executionId: string;
    stepIndex: number;
    outcome: StepOutcome;
    value: string;
    note: string;
    by: string;
  },
): RecordStepResult {
  const execution = db
    .select()
    .from(s.procedureExecutions)
    .where(eq(s.procedureExecutions.id, input.executionId))
    .get();
  if (!execution) return { ok: false, error: "Execution not found." };
  if (execution.status !== "in_progress") {
    return { ok: false, error: `Execution is ${execution.status}.` };
  }

  const procedure = db
    .select()
    .from(s.procedures)
    .where(eq(s.procedures.id, execution.procedureId))
    .get();
  if (!procedure) return { ok: false, error: "Procedure not found." };
  const steps = parseSteps(procedure.body);

  const recorded = db
    .select()
    .from(s.stepRecords)
    .where(eq(s.stepRecords.executionId, input.executionId))
    .all();
  const nextIndex = recorded.length;
  if (input.stepIndex !== nextIndex) {
    return {
      ok: false,
      error: `Steps record in order — next is step ${nextIndex + 1}.`,
    };
  }
  if (nextIndex >= steps.length) {
    return { ok: false, error: "All steps are already recorded." };
  }
  if (input.outcome !== "done" && !input.note.trim()) {
    return { ok: false, error: `A note is required to mark a step ${input.outcome}.` };
  }

  const isLast = nextIndex === steps.length - 1;
  db.transaction((tx) => {
    tx.insert(s.stepRecords)
      .values({
        id: id("stp"),
        executionId: input.executionId,
        stepIndex: nextIndex,
        instruction: steps[nextIndex],
        outcome: input.outcome,
        value: input.value,
        note: input.note,
        recordedBy: input.by,
      })
      .run();
    if (isLast) {
      tx.update(s.procedureExecutions)
        .set({ status: "complete", completedAt: new Date().toISOString() })
        .where(eq(s.procedureExecutions.id, input.executionId))
        .run();
    }
  });

  return { ok: true, executionComplete: isLast };
}

export function abortExecution(
  db: Db,
  input: { executionId: string; by: string; reason: string },
): { ok: true } | { ok: false; error: string } {
  const execution = db
    .select()
    .from(s.procedureExecutions)
    .where(eq(s.procedureExecutions.id, input.executionId))
    .get();
  if (!execution) return { ok: false, error: "Execution not found." };
  if (execution.status !== "in_progress") {
    return { ok: false, error: `Execution is ${execution.status}.` };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: "An abort reason is required." };
  }

  db.update(s.procedureExecutions)
    .set({
      status: "aborted",
      completedAt: new Date().toISOString(),
      abortReason: `${input.reason} (${input.by})`,
    })
    .where(eq(s.procedureExecutions.id, input.executionId))
    .run();
  return { ok: true };
}

export type ExecutionView = {
  execution: typeof s.procedureExecutions.$inferSelect;
  procedure: typeof s.procedures.$inferSelect;
  run: typeof s.runs.$inferSelect;
  steps: Array<{
    index: number;
    instruction: string;
    record: typeof s.stepRecords.$inferSelect | null;
  }>;
  nextIndex: number | null; // null when nothing left to record
};

export function getExecutionView(
  db: Db,
  executionId: string,
): ExecutionView | null {
  const execution = db
    .select()
    .from(s.procedureExecutions)
    .where(eq(s.procedureExecutions.id, executionId))
    .get();
  if (!execution) return null;
  const procedure = db
    .select()
    .from(s.procedures)
    .where(eq(s.procedures.id, execution.procedureId))
    .get();
  const run = db
    .select()
    .from(s.runs)
    .where(eq(s.runs.id, execution.runId))
    .get();
  if (!procedure || !run) return null;

  const records = db
    .select()
    .from(s.stepRecords)
    .where(eq(s.stepRecords.executionId, executionId))
    .orderBy(asc(s.stepRecords.stepIndex))
    .all();
  const byIndex = new Map(records.map((r) => [r.stepIndex, r]));

  const steps = parseSteps(procedure.body).map((instruction, index) => ({
    index,
    instruction,
    record: byIndex.get(index) ?? null,
  }));
  const nextIndex =
    execution.status === "in_progress" && records.length < steps.length
      ? records.length
      : null;

  return { execution, procedure, run, steps, nextIndex };
}

export type RunExecutionSummary = {
  procedureId: string;
  procedureKey: string;
  procedureTitle: string;
  version: string;
  source: "article" | "stand";
  stepCount: number;
  latest: {
    executionId: string;
    status: string;
    recordedCount: number;
    flaggedCount: number;
    startedBy: string;
  } | null;
};

// Per-procedure execution status for a run, across both bound configs.
export function listRunProcedureStatus(
  db: Db,
  runId: string,
): RunExecutionSummary[] {
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
  if (!run) return [];

  const linked: Array<{ procedureId: string; source: "article" | "stand" }> = [];
  for (const [configId, source] of [
    [run.articleConfigId, "article"],
    [run.standConfigId, "stand"],
  ] as const) {
    const rows = db
      .select({ procedureId: s.configProcedures.procedureId })
      .from(s.configProcedures)
      .where(eq(s.configProcedures.configId, configId))
      .all();
    for (const row of rows) linked.push({ procedureId: row.procedureId, source });
  }
  if (linked.length === 0) return [];

  const procedureRows = db
    .select()
    .from(s.procedures)
    .where(inArray(s.procedures.id, linked.map((l) => l.procedureId)))
    .all();
  const procById = new Map(procedureRows.map((p) => [p.id, p]));

  const executions = db
    .select()
    .from(s.procedureExecutions)
    .where(eq(s.procedureExecutions.runId, runId))
    .orderBy(asc(s.procedureExecutions.startedAt))
    .all();

  return linked.flatMap(({ procedureId, source }) => {
    const procedure = procById.get(procedureId);
    if (!procedure) return [];
    const latestExec = executions.filter((e) => e.procedureId === procedureId).at(-1);
    let latest: RunExecutionSummary["latest"] = null;
    if (latestExec) {
      const records = db
        .select()
        .from(s.stepRecords)
        .where(eq(s.stepRecords.executionId, latestExec.id))
        .all();
      latest = {
        executionId: latestExec.id,
        status: latestExec.status,
        recordedCount: records.length,
        flaggedCount: records.filter((r) => r.outcome === "flagged").length,
        startedBy: latestExec.startedBy,
      };
    }
    return [
      {
        procedureId,
        procedureKey: procedure.key,
        procedureTitle: procedure.title,
        version: procedure.version,
        source,
        stepCount: parseSteps(procedure.body).length,
        latest,
      },
    ];
  });
}
