import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  makeArticle,
  makeConfig,
  makePart,
  makeRun,
  makeStand,
} from "../../test/fixtures";
import { recordAsBuilt } from "./asbuilt";
import { trace } from "./trace";

describe("trace (serial/lot genealogy)", () => {
  let db: Db;
  let articleId: string;
  let runId: string;
  let valveRev: string;

  beforeEach(() => {
    db = createTestDb();
    articleId = makeArticle(db, "TP-017");
    const standId = makeStand(db, "STAND-B");
    const articleConfigId = makeConfig(db, "CFG-N1", { status: "released" });
    const standConfigId = makeConfig(db, "STAND-CFG", {
      kind: "stand",
      status: "released",
    });
    runId = makeRun(db, { articleId, standId, articleConfigId, standConfigId });

    valveRev = makePart(db, "VLV-001").revId;
    recordAsBuilt(db, {
      articleId,
      partRevisionId: valveRev,
      qty: 1,
      serialOrLot: "SN-V-017B",
      runId,
    });

    db.insert(s.inventoryLots)
      .values({
        id: id("inv"),
        partRevisionId: valveRev,
        qtyOnHand: 3,
        location: "PROTO-CAGE",
        lotCode: "LOT-V50",
      })
      .run();
    const poId = id("po");
    db.insert(s.purchaseOrders)
      .values({ id: poId, poNumber: "PO-001", supplier: "CryoFit", status: "received" })
      .run();
    db.insert(s.purchaseOrderLines)
      .values({ id: id("pol"), purchaseOrderId: poId, partRevisionId: valveRev, qty: 4 })
      .run();

    db.insert(s.testResults)
      .values({
        id: id("tres"),
        runId,
        testDefinitionId: (() => {
          const t = id("tdef");
          db.insert(s.testDefinitions).values({ id: t, key: "TST-1", name: "Leak" }).run();
          return t;
        })(),
        status: "pass",
      })
      .run();
  });

  it("traces an article serial to build and test history", () => {
    const result = trace(db, "TP-017");
    expect(result.kind).toBe("article");
    if (result.kind !== "article") return;
    expect(result.asBuilt).toHaveLength(1);
    expect(result.asBuilt[0]).toMatchObject({
      partNumber: "VLV-001",
      serialOrLot: "SN-V-017B",
    });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      articleConfigKey: "CFG-N1",
      standConfigKey: "STAND-CFG",
      standKey: "STAND-B",
      passCount: 1,
      gapCount: 0,
    });
  });

  it("traces an installed serial to its article, run, and supplier trail", () => {
    const result = trace(db, "sn-v-017b"); // case-insensitive
    expect(result.kind).toBe("item");
    if (result.kind !== "item") return;
    expect(result.installs).toHaveLength(1);
    expect(result.installs[0]).toMatchObject({
      articleSerial: "TP-017",
      partNumber: "VLV-001",
    });
    expect(result.installs[0].runKey).toBeTruthy();
    // supplier trail via the shared part revision
    expect(result.purchaseOrders).toHaveLength(1);
    expect(result.purchaseOrders[0]).toMatchObject({
      poNumber: "PO-001",
      supplier: "CryoFit",
    });
  });

  it("traces an inventory lot code to stock and supplier", () => {
    const result = trace(db, "LOT-V50");
    expect(result.kind).toBe("item");
    if (result.kind !== "item") return;
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]).toMatchObject({ qtyOnHand: 3, location: "PROTO-CAGE" });
    expect(result.purchaseOrders).toHaveLength(1);
  });

  it("finds every article an item is installed on", () => {
    const second = makeArticle(db, "TP-018");
    recordAsBuilt(db, {
      articleId: second,
      partRevisionId: valveRev,
      qty: 1,
      serialOrLot: "SN-V-017B",
    });
    const result = trace(db, "SN-V-017B");
    if (result.kind !== "item") throw new Error("expected item");
    expect(result.installs.map((i) => i.articleSerial).sort()).toEqual([
      "TP-017",
      "TP-018",
    ]);
  });

  it("returns none for unknown identifiers and empty queries", () => {
    expect(trace(db, "NOPE-123").kind).toBe("none");
    expect(trace(db, "  ").kind).toBe("none");
  });
});
