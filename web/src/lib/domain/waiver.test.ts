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
import { createWaiver } from "./waiver";

describe("createWaiver", () => {
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

  it("records a waiver that shows as a waived gap with reason and approver", () => {
    const result = createWaiver(db, {
      runId,
      testDefinitionId: testId,
      reason: "Re-seal pending",
      approvedBy: "lead.k",
    });
    expect(result.ok).toBe(true);

    const report = getRunVerification(runId);
    expect(report.gaps[0].status).toBe("waived");
    expect(report.gaps[0].detail).toContain("Re-seal pending");
    expect(report.gaps[0].detail).toContain("lead.k");
  });

  it("a waiver outranks a failed result, but a pass outranks the waiver", () => {
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testId,
        status: "fail",
        recordedAt: "2026-07-01T10:00:00Z",
      })
      .run();
    createWaiver(db, {
      runId,
      testDefinitionId: testId,
      reason: "Known bench artifact",
      approvedBy: "lead.k",
    });

    let report = getRunVerification(runId);
    expect(report.gaps[0].status).toBe("waived");

    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testId,
        status: "pass",
        recordedAt: "2026-07-02T10:00:00Z",
      })
      .run();
    report = getRunVerification(runId);
    expect(report.gaps).toHaveLength(0);
    expect(report.passes).toHaveLength(1);
  });

  it("rejects duplicate waivers for the same (run, test)", () => {
    createWaiver(db, {
      runId,
      testDefinitionId: testId,
      reason: "first",
      approvedBy: "lead.k",
    });
    const second = createWaiver(db, {
      runId,
      testDefinitionId: testId,
      reason: "second",
      approvedBy: "lead.k",
    });
    expect(second.ok).toBe(false);
    expect(db.select().from(s.waivers).all()).toHaveLength(1);
  });

  it("rejects unknown run or test", () => {
    expect(
      createWaiver(db, {
        runId: "nope",
        testDefinitionId: testId,
        reason: "r",
        approvedBy: "a",
      }).ok,
    ).toBe(false);
    expect(
      createWaiver(db, {
        runId,
        testDefinitionId: "nope",
        reason: "r",
        approvedBy: "a",
      }).ok,
    ).toBe(false);
  });
});
