import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db";
import * as s from "../db/schema";
import { id } from "./id";
import { createTestDb } from "../test/db";
import {
  makeArticle,
  makeConfig,
  makeRun,
  makeStand,
  makeTestDef,
  requireTest,
} from "../test/fixtures";
import { getRunVerification } from "./queries";

describe("getRunVerification", () => {
  let db: Db;
  let runId: string;
  let testId: string;

  beforeEach(() => {
    db = createTestDb();
    const articleConfigId = makeConfig(db, "ART-N", { status: "released" });
    const standConfigId = makeConfig(db, "STAND-N", {
      kind: "stand",
      status: "released",
    });
    testId = makeTestDef(db, "LEAK-CHECK");
    requireTest(db, articleConfigId, testId);
    runId = makeRun(db, {
      articleId: makeArticle(db, "TP-001"),
      standId: makeStand(db, "STAND-B"),
      articleConfigId,
      standConfigId,
    });
  });

  it("reports a required test with no result as missing", () => {
    const report = getRunVerification(runId);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0]).toMatchObject({ status: "missing", key: "LEAK-CHECK" });
  });

  it("reports a waived test as waived even when no results are recorded (B1)", () => {
    db.insert(s.waivers)
      .values({
        id: id("wvr"),
        runId,
        testDefinitionId: testId,
        reason: "Bench cal pending",
        approvedBy: "lead.k",
      })
      .run();

    const report = getRunVerification(runId);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].status).toBe("waived");
  });

  it("uses the most recently recorded result per test (B2)", () => {
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testId,
        status: "pass",
        recordedAt: "2026-07-01T10:00:00Z",
      })
      .run();
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testId,
        status: "fail",
        recordedAt: "2026-07-02T10:00:00Z",
      })
      .run();

    const report = getRunVerification(runId);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].status).toBe("fail");
  });

  it("counts a passing latest result as a pass, not a gap", () => {
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testId,
        status: "fail",
        recordedAt: "2026-07-01T10:00:00Z",
      })
      .run();
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testId,
        status: "pass",
        recordedAt: "2026-07-02T10:00:00Z",
      })
      .run();

    const report = getRunVerification(runId);
    expect(report.gaps).toHaveLength(0);
    expect(report.passes).toHaveLength(1);
  });
});
