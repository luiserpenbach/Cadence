import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db";
import * as s from "../db/schema";
import { id } from "./id";
import { createTestDb } from "../test/db";
import {
  addBomLine,
  makeArticle,
  makeConfig,
  makePart,
  makeRevision,
} from "../test/fixtures";
import { buildImpactReport, diffBom, getDefaultDelta } from "./impact";
import { compareSerials } from "./serial";

describe("compareSerials", () => {
  it("compares numeric runs as numbers", () => {
    expect(compareSerials("TP-9", "TP-14")).toBeLessThan(0);
    expect(compareSerials("TP-014", "TP-14")).toBe(0);
    expect(compareSerials("TP-20", "TP-14")).toBeGreaterThan(0);
  });

  it("falls back to string comparison for non-numeric parts", () => {
    expect(compareSerials("TP-1", "TQ-1")).toBeLessThan(0);
  });
});

describe("diffBom", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("detects added, removed, and changed lines", () => {
    const valve = makePart(db, "VLV-001", "A");
    const valveRevB = makeRevision(db, valve.partId, "B");
    const orifice = makePart(db, "ORF-070");
    const sensor = makePart(db, "SNS-PT");

    const from = makeConfig(db, "CFG-N");
    addBomLine(db, from, valve.revId, 1, "10");
    addBomLine(db, from, orifice.revId, 2, "20");

    const to = makeConfig(db, "CFG-N1");
    addBomLine(db, to, valveRevB, 1, "10");
    addBomLine(db, to, sensor.revId, 1, "30");

    const deltas = diffBom(from, to);
    const changed = deltas.filter((d) => d.type === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ fromRevision: "A", toRevision: "B" });
    expect(deltas.filter((d) => d.type === "added")).toHaveLength(1);
    expect(deltas.filter((d) => d.type === "removed")).toHaveLength(1);
  });
});

describe("buildImpactReport", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns null for unknown config ids (B8)", () => {
    expect(buildImpactReport("nope", "also-nope")).toBeNull();
  });

  it("getDefaultDelta pairs the latest released cut config with its base", () => {
    expect(getDefaultDelta()).toBeNull();

    const base = makeConfig(db, "CFG-N", { status: "superseded" });
    makeConfig(db, "CFG-N1", {
      status: "released",
      basedOnConfigId: base,
      releasedAt: "2026-07-01T00:00:00Z",
    });
    const newerBase = makeConfig(db, "CFG-M", { status: "superseded" });
    makeConfig(db, "CFG-M1", {
      status: "released",
      basedOnConfigId: newerBase,
      releasedAt: "2026-07-15T00:00:00Z",
    });

    const delta = getDefaultDelta()!;
    expect(delta.from.key).toBe("CFG-M");
    expect(delta.to.key).toBe("CFG-M1");
  });

  it("lists articles below the serial cut-in using numeric order (B6)", () => {
    const from = makeConfig(db, "CFG-N");
    const to = makeConfig(db, "CFG-N1");
    db.insert(s.configEffectivity)
      .values({
        id: id("eff"),
        configId: to,
        serialFrom: "TP-14",
      })
      .run();

    makeArticle(db, "TP-9");
    makeArticle(db, "TP-14");
    makeArticle(db, "TP-20");

    const report = buildImpactReport(from, to);
    expect(report).not.toBeNull();
    // Lexicographic comparison would have put TP-9 "after" TP-14 and missed it.
    expect(report!.articlesOnPrior.map((a) => a.serial)).toEqual(["TP-9"]);
  });
});
