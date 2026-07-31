import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  makeArticle,
  makeConfig,
  makeStand,
  makeTestDef,
  requireTest,
} from "../../test/fixtures";
import { acknowledgeGaps } from "./ack";
import { completeRun, createRun, startRun } from "./run";

describe("run creation and lifecycle", () => {
  let db: Db;
  let articleId: string;
  let standId: string;

  beforeEach(() => {
    db = createTestDb();
    articleId = makeArticle(db, "TP-014");
    standId = makeStand(db, "STAND-B");
  });

  function releasedConfig(key: string, kind: "article" | "stand") {
    const configId = makeConfig(db, key, { kind, status: "released" });
    db.insert(s.configEffectivity)
      .values({ id: id("eff"), configId })
      .run();
    return configId;
  }

  it("binds the resolved article and stand configs", () => {
    const artCfg = releasedConfig("ART-N", "article");
    const standCfg = releasedConfig("STAND-N", "stand");

    const result = createRun(db, { articleId, standId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.articleConfigKey).toBe("ART-N");
    expect(result.standConfigKey).toBe("STAND-N");

    const run = db
      .select()
      .from(s.runs)
      .where(eq(s.runs.id, result.runId))
      .get()!;
    expect(run.articleConfigId).toBe(artCfg);
    expect(run.standConfigId).toBe(standCfg);
    expect(run.status).toBe("planned");
  });

  it("blocks creation when no released config covers the context", () => {
    releasedConfig("STAND-N", "stand");
    const result = createRun(db, { articleId, standId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("No released article config");
    expect(db.select().from(s.runs).all()).toHaveLength(0);
  });

  it("blocks creation on an equal-specificity conflict and names candidates", () => {
    releasedConfig("ART-A", "article");
    releasedConfig("ART-B", "article");
    releasedConfig("STAND-N", "stand");

    const result = createRun(db, { articleId, standId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("conflict");
    expect(result.error).toContain("ART-A");
    expect(result.error).toContain("ART-B");
  });

  it("start requires acknowledging open gaps first (record-and-warn)", () => {
    const artCfg = releasedConfig("ART-N", "article");
    releasedConfig("STAND-N", "stand");
    requireTest(db, artCfg, makeTestDef(db, "LEAK-CHECK"));

    const created = createRun(db, { articleId, standId });
    if (!created.ok) throw new Error("setup failed");
    const runId = created.runId;

    const blocked = startRun(db, runId);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toContain("unacknowledged");

    acknowledgeGaps(db, { runId, by: "m.chen", reason: "bench day" });
    expect(startRun(db, runId).ok).toBe(true);

    const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get()!;
    expect(run.status).toBe("in_progress");
    expect(run.startedAt).toBeTruthy();
  });

  it("start and complete enforce status transitions", () => {
    releasedConfig("ART-N", "article");
    releasedConfig("STAND-N", "stand");
    const created = createRun(db, { articleId, standId });
    if (!created.ok) throw new Error("setup failed");
    const runId = created.runId;

    expect(completeRun(db, runId).ok).toBe(false); // planned → complete invalid
    expect(startRun(db, runId).ok).toBe(true); // no gaps, starts clean
    expect(startRun(db, runId).ok).toBe(false); // already started
    expect(completeRun(db, runId).ok).toBe(true);
    expect(completeRun(db, runId).ok).toBe(false); // already complete

    const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get()!;
    expect(run.status).toBe("complete");
    expect(run.completedAt).toBeTruthy();
  });
});
