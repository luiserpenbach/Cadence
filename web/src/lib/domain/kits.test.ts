import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import {
  addBomLine,
  makeArticle,
  makeConfig,
  makePart,
  makeRevision,
} from "../../test/fixtures";
import { createLot } from "./inventory";
import { allocateKitLine, allocateRemaining, cancelKit, createKit, issueKit, unallocateKitLine } from "./kits";
import { addBomAlternate } from "./config-edit";

function releasedConfigWithPin(db: Db, revId: string) {
  const configId = makeConfig(db, "CFG-N");
  addBomLine(db, configId, revId, 1, "10");
  db.update(s.configurations).set({ status: "released" }).run();
  return configId;
}

describe("kits", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("kits a released config, reserves, issues as-built, and consumes stock", () => {
    const articleId = makeArticle(db, "TP-017");
    const revId = makePart(db, "VLV-001").revId;
    const configId = releasedConfigWithPin(db, revId);
    const lot = createLot(db, {
      partRevisionId: revId,
      qty: 3,
      lotCode: "LOT-V",
      location: "CAGE",
      by: "cage",
    });
    if (!lot.ok) throw new Error("lot");

    const kit = createKit(db, { articleId, configId, by: "cage" });
    expect(kit.ok).toBe(true);
    if (!kit.ok) return;
    const line = db.select().from(s.kitLines).all()[0];
    expect(allocateKitLine(db, { kitLineId: line.id, lotId: lot.lotId, by: "cage" }).ok).toBe(
      true,
    );
    expect(db.select().from(s.kits).all()[0].status).toBe("reserved");
    expect(issueKit(db, { kitId: kit.kitId, by: "cage" }).ok).toBe(true);

    const storedLot = db.select().from(s.inventoryLots).all()[0];
    expect(storedLot.qtyOnHand).toBe(2);
    expect(storedLot.qtyReserved).toBe(0);
    const asBuilt = db.select().from(s.asBuiltLines).all();
    expect(asBuilt).toHaveLength(1);
    expect(asBuilt[0].serialOrLot).toBe("LOT-V");
    expect(asBuilt[0].lotId).toBe(lot.lotId);
  });

  it("cancel releases the reservation", () => {
    const articleId = makeArticle(db, "TP-017");
    const revId = makePart(db, "VLV-001").revId;
    const configId = releasedConfigWithPin(db, revId);
    const lot = createLot(db, {
      partRevisionId: revId,
      qty: 2,
      lotCode: "LOT-V",
      location: "CAGE",
      by: "cage",
    });
    if (!lot.ok) throw new Error("lot");
    const kit = createKit(db, { articleId, configId, by: "cage" });
    if (!kit.ok) throw new Error("kit");
    const line = db.select().from(s.kitLines).all()[0];
    allocateKitLine(db, { kitLineId: line.id, lotId: lot.lotId, by: "cage" });
    expect(cancelKit(db, { kitId: kit.kitId, by: "cage" }).ok).toBe(true);
    const stored = db.select().from(s.inventoryLots).all()[0];
    expect(stored.qtyReserved).toBe(0);
    expect(stored.qtyOnHand).toBe(2);
  });

  it("allows allocating an alternate revision lot", () => {
    const articleId = makeArticle(db, "TP-017");
    const part = makePart(db, "VLV-001", "A");
    const revB = makeRevision(db, part.partId, "B");
    const configId = makeConfig(db, "CFG-N");
    addBomLine(db, configId, part.revId, 1, "10");
    const line = db.select().from(s.configBomLines).all()[0];
    expect(
      addBomAlternate(db, {
        configId,
        bomLineId: line.id,
        partRevisionId: revB,
      }).ok,
    ).toBe(true);
    db.update(s.configurations).set({ status: "released" }).run();

    const lot = createLot(db, {
      partRevisionId: revB,
      qty: 1,
      lotCode: "LOT-B",
      location: "CAGE",
      by: "cage",
    });
    if (!lot.ok) throw new Error("lot");
    const kit = createKit(db, { articleId, configId, by: "cage" });
    if (!kit.ok) throw new Error("kit");
    const kitLine = db.select().from(s.kitLines).all()[0];
    expect(
      allocateKitLine(db, {
        kitLineId: kitLine.id,
        lotId: lot.lotId,
        by: "cage",
      }).ok,
    ).toBe(true);
  });

  it("allocates remaining lines from available lots and can unallocate", () => {
    const articleId = makeArticle(db, "TP-017");
    const valve = makePart(db, "VLV-001").revId;
    const orifice = makePart(db, "ORF-070").revId;
    const configId = makeConfig(db, "CFG-N");
    addBomLine(db, configId, valve, 1, "10");
    addBomLine(db, configId, orifice, 1, "20");
    db.update(s.configurations).set({ status: "released" }).run();

    const vLot = createLot(db, {
      partRevisionId: valve,
      qty: 1,
      lotCode: "LOT-V",
      location: "CAGE",
      by: "cage",
    });
    const oLot = createLot(db, {
      partRevisionId: orifice,
      qty: 1,
      lotCode: "LOT-O",
      location: "CAGE",
      by: "cage",
    });
    if (!vLot.ok || !oLot.ok) throw new Error("lot");

    const kit = createKit(db, { articleId, configId, by: "cage" });
    if (!kit.ok) throw new Error("kit");
    const remaining = allocateRemaining(db, { kitId: kit.kitId, by: "cage" });
    expect(remaining.ok).toBe(true);
    if (!remaining.ok) return;
    expect(remaining.allocated).toBe(2);
    expect(db.select().from(s.kits).all()[0].status).toBe("reserved");

    const line = db.select().from(s.kitLines).all()[0];
    expect(unallocateKitLine(db, { kitLineId: line.id, by: "cage" }).ok).toBe(true);
    expect(db.select().from(s.kits).all()[0].status).toBe("open");
    expect(db.select().from(s.inventoryLots).all().every((l) => l.qtyReserved <= 1)).toBe(
      true,
    );
  });
});
