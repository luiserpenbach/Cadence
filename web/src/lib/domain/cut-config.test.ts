import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  addBomLine,
  makeArticle,
  makeConfig,
  makePart,
  makeRevision,
  makeStand,
  makeTestDef,
  requireTest,
} from "../../test/fixtures";
import { cutConfiguration } from "./cut-config";

describe("cutConfiguration", () => {
  let db: Db;
  let baseId: string;

  beforeEach(() => {
    db = createTestDb();
    baseId = makeConfig(db, "CFG-N", { status: "released", riskClass: "R2" });

    const valve = makePart(db, "VLV-001");
    addBomLine(db, baseId, valve.revId, 2, "10");
    requireTest(db, baseId, makeTestDef(db, "LEAK-CHECK"));

    const procId = id("proc");
    db.insert(s.procedures)
      .values({ id: procId, key: "PROC-1", title: "Purge sequence" })
      .run();
    db.insert(s.configProcedures)
      .values({ id: id("cpr"), configId: baseId, procedureId: procId })
      .run();

    const standId = makeStand(db, "STAND-B");
    const effId = id("eff");
    db.insert(s.configEffectivity)
      .values({
        id: effId,
        configId: baseId,
        articleScope: "explicit",
        standScope: "explicit",
        standId,
      })
      .run();
    db.insert(s.configEffectivityArticles)
      .values({
        id: id("efa"),
        effectivityId: effId,
        articleId: makeArticle(db, "TP-001"),
      })
      .run();
  });

  it("copies BoM, tests, procedures, and effectivity with article links (B5)", () => {
    const result = cutConfiguration(db, {
      basedOnId: baseId,
      key: "CFG-N1",
      name: "Next cut",
      riskClass: "R2",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const newId = result.configId;
    const config = db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, newId))
      .get()!;
    expect(config.status).toBe("draft");
    expect(config.basedOnConfigId).toBe(baseId);

    const bom = db
      .select()
      .from(s.configBomLines)
      .where(eq(s.configBomLines.configId, newId))
      .all();
    expect(bom).toHaveLength(1);
    expect(bom[0]).toMatchObject({ qty: 2, findNumber: "10" });

    expect(
      db
        .select()
        .from(s.configRequiredTests)
        .where(eq(s.configRequiredTests.configId, newId))
        .all(),
    ).toHaveLength(1);
    expect(
      db
        .select()
        .from(s.configProcedures)
        .where(eq(s.configProcedures.configId, newId))
        .all(),
    ).toHaveLength(1);

    const effectivity = db
      .select()
      .from(s.configEffectivity)
      .where(eq(s.configEffectivity.configId, newId))
      .all();
    expect(effectivity).toHaveLength(1);
    expect(effectivity[0].standScope).toBe("explicit");
    expect(effectivity[0].articleScope).toBe("explicit");
    expect(
      db
        .select()
        .from(s.configEffectivityArticles)
        .where(eq(s.configEffectivityArticles.effectivityId, effectivity[0].id))
        .all(),
    ).toHaveLength(1);
  });

  it("swaps pins to the latest catalog rev when asked", () => {
    const valve = db
      .select()
      .from(s.parts)
      .all()
      .find((p) => p.partNumber === "VLV-001")!;
    const revB = makeRevision(db, valve.id, "B");
    const result = cutConfiguration(db, {
      basedOnId: baseId,
      key: "CFG-N1",
      name: "Next cut",
      riskClass: "R2",
      applyLatestRevs: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.swapped).toEqual([
      expect.objectContaining({
        partNumber: "VLV-001",
        fromRev: "A",
        toRev: "B",
      }),
    ]);
    const bom = db
      .select()
      .from(s.configBomLines)
      .where(eq(s.configBomLines.configId, result.configId))
      .all();
    expect(bom[0].partRevisionId).toBe(revB);
    expect(result.configId);
    const cfg = db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, result.configId))
      .get()!;
    expect(cfg.notes).toContain("swapped");
  });

  it("says pins were already latest when nothing to swap", () => {
    const result = cutConfiguration(db, {
      basedOnId: baseId,
      key: "CFG-N1",
      name: "Next cut",
      riskClass: "R2",
      applyLatestRevs: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.swapped).toEqual([]);
    const cfg = db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, result.configId))
      .get()!;
    expect(cfg.notes).toContain("already at latest");
  });
});

  it("rejects a duplicate key without leaving orphan rows (B5)", () => {
    const result = cutConfiguration(db, {
      basedOnId: baseId,
      key: "CFG-N",
      name: "Duplicate",
      riskClass: "R2",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("already exists");

    expect(db.select().from(s.configurations).all()).toHaveLength(1);
    expect(db.select().from(s.configBomLines).all()).toHaveLength(1);
  });

  it("rejects an unknown base config", () => {
    const result = cutConfiguration(db, {
      basedOnId: "nope",
      key: "CFG-X",
      name: "X",
      riskClass: "R1",
    });
    expect(result.ok).toBe(false);
  });
});
