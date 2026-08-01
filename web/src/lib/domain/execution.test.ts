import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  makeArticle,
  makeConfig,
  makeRun,
  makeStand,
} from "../../test/fixtures";
import {
  abortExecution,
  getExecutionView,
  listRunProcedureStatus,
  parseSteps,
  recordStep,
  startExecution,
} from "./execution";

describe("parseSteps", () => {
  it("splits non-empty lines and strips manual numbering", () => {
    expect(parseSteps("1. Install valve\n2) Torque fittings\n\n Bag and tag ")).toEqual([
      "Install valve",
      "Torque fittings",
      "Bag and tag",
    ]);
    expect(parseSteps("")).toEqual([]);
  });
});

describe("procedure execution", () => {
  let db: Db;
  let runId: string;
  let procedureId: string;

  beforeEach(() => {
    db = createTestDb();
    const articleConfigId = makeConfig(db, "ART-N", { status: "released" });
    const standConfigId = makeConfig(db, "STAND-N", {
      kind: "stand",
      status: "released",
    });
    procedureId = id("proc");
    db.insert(s.procedures)
      .values({
        id: procedureId,
        key: "PROC-1",
        title: "Purge",
        body: "1. Open valve\n2. Purge 60s\n3. Close valve",
      })
      .run();
    db.insert(s.configProcedures)
      .values({ id: id("cpr"), configId: articleConfigId, procedureId })
      .run();
    runId = makeRun(db, {
      articleId: makeArticle(db, "TP-001"),
      standId: makeStand(db, "STAND-B"),
      articleConfigId,
      standConfigId,
    });
    db.update(s.runs)
      .set({ status: "in_progress" })
      .where(eq(s.runs.id, runId))
      .run();
  });

  function start() {
    const result = startExecution(db, { runId, procedureId, by: "tech.lee" });
    if (!result.ok) throw new Error(result.error);
    return result.executionId;
  }

  it("requires an in-progress run", () => {
    db.update(s.runs).set({ status: "planned" }).where(eq(s.runs.id, runId)).run();
    const result = startExecution(db, { runId, procedureId, by: "tech.lee" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Start the run");
  });

  it("prevents duplicate in-progress executions of the same procedure", () => {
    start();
    expect(startExecution(db, { runId, procedureId, by: "x" }).ok).toBe(false);
  });

  it("records steps strictly in order and snapshots instructions", () => {
    const executionId = start();
    const outOfOrder = recordStep(db, {
      executionId,
      stepIndex: 1,
      outcome: "done",
      value: "",
      note: "",
      by: "tech.lee",
    });
    expect(outOfOrder.ok).toBe(false);

    const first = recordStep(db, {
      executionId,
      stepIndex: 0,
      outcome: "done",
      value: "",
      note: "",
      by: "tech.lee",
    });
    expect(first).toMatchObject({ ok: true, executionComplete: false });

    const record = db.select().from(s.stepRecords).all()[0];
    expect(record.instruction).toBe("Open valve");
    expect(record.recordedBy).toBe("tech.lee");
  });

  it("requires a note for skipped and flagged steps", () => {
    const executionId = start();
    expect(
      recordStep(db, {
        executionId,
        stepIndex: 0,
        outcome: "skipped",
        value: "",
        note: "",
        by: "tech.lee",
      }).ok,
    ).toBe(false);
    expect(
      recordStep(db, {
        executionId,
        stepIndex: 0,
        outcome: "flagged",
        value: "",
        note: "Seal seepage at 30 psi",
        by: "tech.lee",
      }).ok,
    ).toBe(true);
  });

  it("completes the execution when the last step records", () => {
    const executionId = start();
    for (let i = 0; i < 3; i++) {
      const result = recordStep(db, {
        executionId,
        stepIndex: i,
        outcome: "done",
        value: i === 1 ? "62s" : "",
        note: "",
        by: "tech.lee",
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.executionComplete).toBe(i === 2);
    }
    const execution = db.select().from(s.procedureExecutions).all()[0];
    expect(execution.status).toBe("complete");
    expect(execution.completedAt).toBeTruthy();

    // completed executions are immutable
    expect(
      recordStep(db, {
        executionId,
        stepIndex: 3,
        outcome: "done",
        value: "",
        note: "",
        by: "x",
      }).ok,
    ).toBe(false);
  });

  it("abort requires a reason and closes the execution", () => {
    const executionId = start();
    expect(abortExecution(db, { executionId, by: "x", reason: " " }).ok).toBe(false);
    expect(
      abortExecution(db, { executionId, by: "tech.lee", reason: "GN2 supply lost" }).ok,
    ).toBe(true);
    const execution = db.select().from(s.procedureExecutions).all()[0];
    expect(execution.status).toBe("aborted");
    expect(execution.abortReason).toContain("GN2 supply lost");
  });

  it("execution view exposes steps, records, and the next index", () => {
    const executionId = start();
    recordStep(db, {
      executionId,
      stepIndex: 0,
      outcome: "done",
      value: "",
      note: "",
      by: "tech.lee",
    });
    const view = getExecutionView(db, executionId)!;
    expect(view.steps).toHaveLength(3);
    expect(view.steps[0].record?.outcome).toBe("done");
    expect(view.steps[1].record).toBeNull();
    expect(view.nextIndex).toBe(1);
  });

  it("run procedure status summarizes the latest execution", () => {
    let status = listRunProcedureStatus(db, runId);
    expect(status).toHaveLength(1);
    expect(status[0].latest).toBeNull();
    expect(status[0].stepCount).toBe(3);

    const executionId = start();
    recordStep(db, {
      executionId,
      stepIndex: 0,
      outcome: "flagged",
      value: "",
      note: "check",
      by: "tech.lee",
    });
    status = listRunProcedureStatus(db, runId);
    expect(status[0].latest).toMatchObject({
      status: "in_progress",
      recordedCount: 1,
      flaggedCount: 1,
    });
  });
});
