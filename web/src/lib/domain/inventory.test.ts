import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { makePart } from "../../test/fixtures";
import {
  adjustLot,
  availableQty,
  consumeLot,
  createLot,
  reserveLot,
  stockByRevision,
  unreserveLot,
} from "./inventory";

describe("inventory lots", () => {
  let db: Db;
  let revId: string;

  beforeEach(() => {
    db = createTestDb();
    revId = makePart(db, "VLV-001").revId;
  });

  it("creates a lot and tracks available qty", () => {
    const created = createLot(db, {
      partRevisionId: revId,
      qty: 5,
      lotCode: "LOT-A",
      location: "PROTO-CAGE",
      by: "cage",
    });
    expect(created.ok).toBe(true);
    const lot = db.select().from(s.inventoryLots).all()[0];
    expect(lot.qtyOnHand).toBe(5);
    expect(availableQty(lot)).toBe(5);
    expect(db.select().from(s.inventoryMovements).all()).toHaveLength(1);
  });

  it("rejects duplicate lot codes on the same revision", () => {
    createLot(db, {
      partRevisionId: revId,
      qty: 1,
      lotCode: "LOT-A",
      location: "CAGE",
      by: "a",
    });
    expect(
      createLot(db, {
        partRevisionId: revId,
        qty: 1,
        lotCode: "LOT-A",
        location: "CAGE",
        by: "a",
      }).ok,
    ).toBe(false);
  });

  it("adjusts up and refuses to go below reserved", () => {
    const created = createLot(db, {
      partRevisionId: revId,
      qty: 4,
      lotCode: "LOT-A",
      location: "CAGE",
      by: "a",
    });
    if (!created.ok) throw new Error("setup");
    expect(
      reserveLot(db, {
        lotId: created.lotId,
        qty: 2,
        by: "a",
        reason: "kit",
      }).ok,
    ).toBe(true);
    expect(
      adjustLot(db, {
        lotId: created.lotId,
        qtyDelta: -3,
        by: "a",
        reason: "count",
      }).ok,
    ).toBe(false);
    expect(
      adjustLot(db, {
        lotId: created.lotId,
        qtyDelta: -1,
        by: "a",
        reason: "count",
      }).ok,
    ).toBe(true);
    const lot = db.select().from(s.inventoryLots).all()[0];
    expect(lot.qtyOnHand).toBe(3);
    expect(lot.qtyReserved).toBe(2);
  });

  it("consume refuses more than available", () => {
    const created = createLot(db, {
      partRevisionId: revId,
      qty: 2,
      lotCode: "LOT-A",
      location: "CAGE",
      by: "a",
    });
    if (!created.ok) throw new Error("setup");
    reserveLot(db, { lotId: created.lotId, qty: 1, by: "a", reason: "k" });
    expect(
      consumeLot(db, {
        lotId: created.lotId,
        qty: 2,
        by: "a",
        reason: "install",
      }).ok,
    ).toBe(false);
    expect(
      consumeLot(db, {
        lotId: created.lotId,
        qty: 1,
        by: "a",
        reason: "install",
      }).ok,
    ).toBe(true);
  });

  it("unreserve restores availability", () => {
    const created = createLot(db, {
      partRevisionId: revId,
      qty: 3,
      lotCode: "LOT-A",
      location: "CAGE",
      by: "a",
    });
    if (!created.ok) throw new Error("setup");
    reserveLot(db, { lotId: created.lotId, qty: 2, by: "a", reason: "k" });
    unreserveLot(db, { lotId: created.lotId, qty: 2, by: "a", reason: "cancel" });
    const lot = db.select().from(s.inventoryLots).all()[0];
    expect(availableQty(lot)).toBe(3);
    const summary = stockByRevision(db).get(revId)!;
    expect(summary.available).toBe(3);
  });
});
