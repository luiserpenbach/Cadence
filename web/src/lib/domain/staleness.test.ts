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
  makeTestDef,
  requireTest,
} from "../../test/fixtures";
import { releaseConfiguration } from "./release";
import { propagateStaleness } from "./staleness";

describe("supersede + staleness on release", () => {
  let db: Db;
  let baseId: string;
  let nextId: string;
  let sharedTest: string;
  let standId: string;
  let standConfigId: string;

  beforeEach(() => {
    db = createTestDb();
    baseId = makeConfig(db, "CFG-N", { status: "released" });
    nextId = makeConfig(db, "CFG-N1", { basedOnConfigId: baseId });
    sharedTest = makeTestDef(db, "LEAK-CHECK");
    requireTest(db, baseId, sharedTest);
    requireTest(db, nextId, sharedTest);
    // N+1 applies to any article on any stand
    db.insert(s.configEffectivity)
      .values({ id: id("eff"), configId: nextId })
      .run();
    standId = makeStand(db, "STAND-B");
    standConfigId = makeConfig(db, "STAND-CFG", {
      kind: "stand",
      status: "released",
    });
  });

  function makeBoundRun(serial: string) {
    return makeRun(db, {
      articleId: makeArticle(db, serial),
      standId,
      articleConfigId: baseId,
      standConfigId,
    });
  }

  function passResult(runId: string, testId: string) {
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: testId,
        status: "pass",
        recordedAt: "2026-07-01T10:00:00Z",
      })
      .run();
  }

  it("marks the base config superseded when the cut config releases (G5)", () => {
    const result = releaseConfiguration(db, { configId: nextId, by: "m.chen" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.supersededKey).toBe("CFG-N");

    const base = db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, baseId))
      .get()!;
    expect(base.status).toBe("superseded");
  });

  it("inserts stale results for passing shared tests on covered runs (G2)", () => {
    const runId = makeBoundRun("TP-001");
    passResult(runId, sharedTest);

    const result = releaseConfiguration(db, { configId: nextId, by: "m.chen" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.staleCount).toBe(1);

    const results = db
      .select()
      .from(s.testResults)
      .where(eq(s.testResults.runId, runId))
      .all();
    const stale = results.find((r) => r.status === "stale");
    expect(stale).toBeDefined();
    expect(stale!.recordedBy).toBe("system");
    expect(stale!.notes).toContain("CFG-N1");
  });

  it("does not stale runs outside the new config's effectivity", () => {
    // Narrow N+1 to serials from TP-100 on
    db.delete(s.configEffectivity)
      .where(eq(s.configEffectivity.configId, nextId))
      .run();
    db.insert(s.configEffectivity)
      .values({ id: id("eff"), configId: nextId, serialFrom: "TP-100" })
      .run();

    const runId = makeBoundRun("TP-001");
    passResult(runId, sharedTest);

    expect(propagateStaleness(db, nextId)).toBe(0);
    const statuses = db
      .select()
      .from(s.testResults)
      .where(eq(s.testResults.runId, runId))
      .all()
      .map((r) => r.status);
    expect(statuses).toEqual(["pass"]);
  });

  it("does not stale tests that are missing or already failed", () => {
    const runId = makeBoundRun("TP-001");
    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: sharedTest,
        status: "fail",
        recordedAt: "2026-07-01T10:00:00Z",
      })
      .run();

    expect(propagateStaleness(db, nextId)).toBe(0);
  });

  it("does not stale tests only required by one of the two configs", () => {
    const onlyNewTest = makeTestDef(db, "NEW-ONLY");
    requireTest(db, nextId, onlyNewTest);
    const runId = makeBoundRun("TP-001");
    passResult(runId, onlyNewTest);

    expect(propagateStaleness(db, nextId)).toBe(0);
  });
});
