import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  addBomLine as addBomLineFixture,
  makeArticle,
  makeConfig,
  makePart,
  makeRevision,
  makeRun,
  makeStand,
} from "../../test/fixtures";
import { diffAsBuilt, recordAsBuilt, reverseAsBuilt } from "./asbuilt";

describe("as-built capture and delta", () => {
  let db: Db;
  let articleId: string;
  let configId: string;
  let valveRevA: string;
  let valveRevB: string;
  let orificeRev: string;

  beforeEach(() => {
    db = createTestDb();
    articleId = makeArticle(db, "TP-014");
    const standId = makeStand(db, "STAND-B");
    configId = makeConfig(db, "CFG-N", { status: "released" });
    const standConfigId = makeConfig(db, "STAND-CFG", {
      kind: "stand",
      status: "released",
    });

    const valve = makePart(db, "VLV-001", "A");
    valveRevA = valve.revId;
    valveRevB = makeRevision(db, valve.partId, "B");
    orificeRev = makePart(db, "ORF-070").revId;

    addBomLineFixture(db, configId, valveRevA, 1, "10");
    addBomLineFixture(db, configId, orificeRev, 2, "20");

    makeRun(db, { articleId, standId, articleConfigId: configId, standConfigId });
  });

  it("records lines and validates run binding", () => {
    expect(
      recordAsBuilt(db, {
        articleId,
        partRevisionId: valveRevA,
        qty: 1,
        serialOrLot: "SN-1",
      }).ok,
    ).toBe(true);

    const otherArticle = makeArticle(db, "TP-099");
    const foreignRun = db.select().from(s.runs).all()[0];
    expect(
      recordAsBuilt(db, {
        articleId: otherArticle,
        partRevisionId: valveRevA,
        qty: 1,
        serialOrLot: "",
        runId: foreignRun.id,
      }).ok,
    ).toBe(false);
  });

  it("reports missing, qty mismatch, and extra lines vs the bound config", () => {
    // valve built at rev B (config pins rev A) => rev A missing + rev B extra
    recordAsBuilt(db, {
      articleId,
      partRevisionId: valveRevB,
      qty: 1,
      serialOrLot: "SN-V",
    });
    // orifice under-built: 1 of 2
    recordAsBuilt(db, {
      articleId,
      partRevisionId: orificeRev,
      qty: 1,
      serialOrLot: "",
    });

    const delta = diffAsBuilt(db, articleId)!;
    expect(delta.configKey).toBe("CFG-N");
    const kinds = Object.fromEntries(
      delta.lines.map((l) => [`${l.partNumber}@${l.revision}`, l.kind]),
    );
    expect(kinds["VLV-001@A"]).toBe("missing");
    expect(kinds["VLV-001@B"]).toBe("extra");
    expect(kinds["ORF-070@A"]).toBe("qty_mismatch");
  });

  it("reports a clean match when as-built sums equal the BoM", () => {
    recordAsBuilt(db, {
      articleId,
      partRevisionId: valveRevA,
      qty: 1,
      serialOrLot: "SN-V",
    });
    recordAsBuilt(db, { articleId, partRevisionId: orificeRev, qty: 1, serialOrLot: "" });
    recordAsBuilt(db, { articleId, partRevisionId: orificeRev, qty: 1, serialOrLot: "" });

    const delta = diffAsBuilt(db, articleId)!;
    expect(delta.lines).toHaveLength(0);
  });

  it("returns null when the article has no runs, no covering config, and no as-built", () => {
    const loose = makeArticle(db, "TP-050");
    expect(diffAsBuilt(db, loose)).toBeNull();
  });

  it("compares as-built to the live resolved config when there is no run", () => {
    const loose = makeArticle(db, "TP-050");
    db.insert(s.configEffectivity)
      .values({
        id: id("eff"),
        configId,
        articleScope: "any",
        standScope: "any",
      })
      .run();
    recordAsBuilt(db, {
      articleId: loose,
      partRevisionId: valveRevA,
      qty: 1,
      serialOrLot: "SN-X",
    });
    const delta = diffAsBuilt(db, loose)!;
    expect(delta.configKey).toBe("CFG-N");
    expect(delta.lines.some((l) => l.kind === "missing")).toBe(true);
  });

  it("consumes a matching inventory lot and can reverse it", () => {
    db.insert(s.inventoryLots)
      .values({
        id: id("inv"),
        partRevisionId: valveRevA,
        qtyOnHand: 2,
        lotCode: "LOT-V",
      })
      .run();
    expect(
      recordAsBuilt(db, {
        articleId,
        partRevisionId: valveRevA,
        qty: 1,
        serialOrLot: "LOT-V",
        by: "tech",
      }).ok,
    ).toBe(true);
    const lot = db.select().from(s.inventoryLots).all()[0];
    expect(lot.qtyOnHand).toBe(1);
    const line = db.select().from(s.asBuiltLines).all().at(-1)!;
    expect(reverseAsBuilt(db, { asBuiltId: line.id, by: "tech" }).ok).toBe(true);
    expect(db.select().from(s.inventoryLots).all()[0].qtyOnHand).toBe(2);
  });

  it("uses the most recent run's config", () => {
    const newConfigId = makeConfig(db, "CFG-N1", { status: "released" });
    addBomLineFixture(db, newConfigId, valveRevB, 1, "10");
    const standId = db.select().from(s.stands).all()[0].id;
    const standConfigId = db
      .select()
      .from(s.configurations)
      .all()
      .find((c) => c.kind === "stand")!.id;
    db.insert(s.runs)
      .values({
        id: id("run"),
        key: "RUN-LATER",
        articleId,
        standId,
        articleConfigId: newConfigId,
        standConfigId,
        createdAt: "2030-01-01 00:00:00",
      })
      .run();

    const delta = diffAsBuilt(db, articleId)!;
    expect(delta.configKey).toBe("CFG-N1");
  });
});
