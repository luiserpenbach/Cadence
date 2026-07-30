import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  makeArticle,
  makeConfig,
  makeRun,
  makeStand,
  makeTestDef,
  requireTest,
} from "../../test/fixtures";
import { getRunVerification } from "../queries";
import { acknowledgeGaps } from "./ack";

describe("acknowledgeGaps", () => {
  let db: Db;
  let runId: string;
  let testA: string;
  let testB: string;

  beforeEach(() => {
    db = createTestDb();
    const articleConfigId = makeConfig(db, "ART-N", { status: "released" });
    const standConfigId = makeConfig(db, "STAND-N", {
      kind: "stand",
      status: "released",
    });
    testA = makeTestDef(db, "LEAK-CHECK");
    testB = makeTestDef(db, "COLD-FLOW");
    requireTest(db, articleConfigId, testA);
    runId = makeRun(db, {
      articleId: makeArticle(db, "TP-001"),
      standId: makeStand(db, "STAND-B"),
      articleConfigId,
      standConfigId,
    });
    // testB becomes a requirement later in some tests
  });

  it("covers exactly the gaps open at ack time (G4)", () => {
    const result = acknowledgeGaps(db, {
      runId,
      by: "m.chen",
      reason: "Bench day",
    });
    expect(result).toMatchObject({ ok: true, count: 1 });

    const report = getRunVerification(runId);
    expect(report.gaps[0].acknowledged).toBe(true);
    expect(report.unacknowledgedCount).toBe(0);
    expect(report.acks).toHaveLength(1);
  });

  it("re-warns when a new gap appears after the ack — no silent green", () => {
    acknowledgeGaps(db, { runId, by: "m.chen", reason: "Bench day" });

    // A new required test appears (e.g. config change adds COLD-FLOW)
    const run = db.select().from(s.runs).all()[0];
    requireTest(db, run.articleConfigId, testB);

    const report = getRunVerification(runId);
    expect(report.gaps).toHaveLength(2);
    expect(report.unacknowledgedCount).toBe(1);
    const fresh = report.gaps.find((g) => g.testDefinitionId === testB)!;
    expect(fresh.acknowledged).toBe(false);
  });

  it("a status change invalidates the old ack for that test", () => {
    acknowledgeGaps(db, { runId, by: "m.chen", reason: "Bench day" });
    // The acknowledged `missing` gap turns into a `fail`
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testA,
        status: "fail",
        recordedAt: "2026-07-01T10:00:00Z",
      })
      .run();

    const report = getRunVerification(runId);
    expect(report.gaps[0].status).toBe("fail");
    expect(report.gaps[0].acknowledged).toBe(false);
    expect(report.unacknowledgedCount).toBe(1);
  });

  it("a second ack covers newly appeared gaps", () => {
    acknowledgeGaps(db, { runId, by: "m.chen", reason: "Bench day" });
    const run = db.select().from(s.runs).all()[0];
    requireTest(db, run.articleConfigId, testB);

    const second = acknowledgeGaps(db, {
      runId,
      by: "lead.k",
      reason: "Cold-flow deferred",
    });
    expect(second).toMatchObject({ ok: true, count: 1 });

    const report = getRunVerification(runId);
    expect(report.unacknowledgedCount).toBe(0);
    expect(report.acks).toHaveLength(2);
  });

  it("refuses to ack when there is nothing unacknowledged", () => {
    acknowledgeGaps(db, { runId, by: "m.chen", reason: "Bench day" });
    const again = acknowledgeGaps(db, { runId, by: "m.chen", reason: "again" });
    expect(again.ok).toBe(false);
  });

  it("refuses an unknown run", () => {
    expect(acknowledgeGaps(db, { runId: "nope", by: "x", reason: "y" }).ok).toBe(
      false,
    );
  });
});
