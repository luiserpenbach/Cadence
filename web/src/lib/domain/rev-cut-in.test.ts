import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  addBomLine,
  makeConfig,
  makePart,
  makeRevision,
} from "../../test/fixtures";
import { cutInRevision } from "./rev-cut-in";

describe("cutInRevision (one-shot rev cut-in)", () => {
  let db: Db;
  let valvePartId: string;
  let valveRevA: string;
  let valveRevB: string;
  let orificeRev: string;

  beforeEach(() => {
    db = createTestDb();
    const valve = makePart(db, "VLV-001", "A");
    valvePartId = valve.partId;
    valveRevA = valve.revId;
    valveRevB = makeRevision(db, valvePartId, "B");
    orificeRev = makePart(db, "ORF-070").revId;
  });

  it("drafts every released config pinning an older rev, with the pin swapped", () => {
    const cfg1 = makeConfig(db, "CFG-1", { status: "released" });
    addBomLine(db, cfg1, valveRevA, 2, "10");
    addBomLine(db, cfg1, orificeRev, 1, "20");
    const cfg2 = makeConfig(db, "STAND-1", { kind: "stand", status: "released" });
    addBomLine(db, cfg2, valveRevA, 1, "5");
    // effectivity on cfg1 to check it copies
    db.insert(s.configEffectivity)
      .values({
        id: id("eff"),
        configId: cfg1,
        articleScope: "serial_range",
        serialFrom: "TP-010",
      })
      .run();

    const result = cutInRevision(db, { partRevisionId: valveRevB, riskClass: "R2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts.map((d) => d.key).sort()).toEqual([
      "CFG-1-B",
      "STAND-1-B",
    ]);

    const draft1 = result.drafts.find((d) => d.fromKey === "CFG-1")!;
    const config = db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, draft1.configId))
      .get()!;
    expect(config.status).toBe("draft");
    expect(config.riskClass).toBe("R2");
    expect(config.basedOnConfigId).toBe(cfg1);

    const bom = db
      .select()
      .from(s.configBomLines)
      .where(eq(s.configBomLines.configId, draft1.configId))
      .all();
    const valveLine = bom.find((l) => l.findNumber === "10")!;
    expect(valveLine.partRevisionId).toBe(valveRevB); // swapped
    expect(valveLine.qty).toBe(2); // preserved
    const orificeLine = bom.find((l) => l.findNumber === "20")!;
    expect(orificeLine.partRevisionId).toBe(orificeRev); // untouched

    const eff = db
      .select()
      .from(s.configEffectivity)
      .where(eq(s.configEffectivity.configId, draft1.configId))
      .all();
    expect(eff).toHaveLength(1);
    expect(eff[0].serialFrom).toBe("TP-010");
  });

  it("ignores draft and superseded configs and configs not pinning the part", () => {
    const draftCfg = makeConfig(db, "CFG-DRAFT");
    addBomLine(db, draftCfg, valveRevA, 1, "");
    const oldCfg = makeConfig(db, "CFG-OLD", { status: "superseded" });
    addBomLine(db, oldCfg, valveRevA, 1, "");
    const unrelated = makeConfig(db, "CFG-ORF", { status: "released" });
    addBomLine(db, unrelated, orificeRev, 1, "");

    const result = cutInRevision(db, { partRevisionId: valveRevB, riskClass: "R1" });
    expect(result.ok).toBe(false);
  });

  it("generates unique keys on repeat cut-ins", () => {
    const cfg = makeConfig(db, "CFG-1", { status: "released" });
    addBomLine(db, cfg, valveRevA, 1, "");
    const first = cutInRevision(db, { partRevisionId: valveRevB, riskClass: "R1" });
    if (!first.ok) throw new Error("setup");
    // release the draft so it becomes a target too... instead: cut in again
    // against the same released base — key CFG-1-B is taken.
    const second = cutInRevision(db, { partRevisionId: valveRevB, riskClass: "R1" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.drafts[0].key).toBe("CFG-1-B-2");
  });

  it("rejects a revision with no siblings pinned anywhere", () => {
    const lonely = makePart(db, "SNS-1").revId;
    expect(cutInRevision(db, { partRevisionId: lonely, riskClass: "R1" }).ok).toBe(false);
    expect(cutInRevision(db, { partRevisionId: "nope", riskClass: "R1" }).ok).toBe(false);
  });
});
