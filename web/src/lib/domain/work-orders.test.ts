import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { addBomLine, makeConfig, makePart } from "../../test/fixtures";
import {
  cancelWorkOrder,
  completeWorkOrder,
  createWorkOrder,
  openWorkOrdersForShortages,
} from "./work-orders";

describe("work orders", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("opens, completes into a lot, and numbers sequentially", () => {
    const revId = makePart(db, "INJ-100", "A", { sourcing: "make" }).revId;
    const first = createWorkOrder(db, {
      partRevisionId: revId,
      qty: 2,
      by: "shop",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.key).toBe("WO-001");
    const done = completeWorkOrder(db, { workOrderId: first.workOrderId, by: "shop" });
    expect(done.ok).toBe(true);
    const lot = db.select().from(s.inventoryLots).all()[0];
    expect(lot.qtyOnHand).toBe(2);
    expect(lot.lotCode).toContain("WO-001");

    const second = createWorkOrder(db, {
      partRevisionId: revId,
      qty: 1,
      by: "shop",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.key).toBe("WO-002");
  });

  it("rejects buy parts and cancelled completes", () => {
    const buy = makePart(db, "VLV-001").revId;
    expect(
      createWorkOrder(db, { partRevisionId: buy, qty: 1, by: "shop" }).ok,
    ).toBe(false);
    const make = makePart(db, "INJ-100", "A", { sourcing: "make" }).revId;
    const wo = createWorkOrder(db, {
      partRevisionId: make,
      qty: 1,
      by: "shop",
    });
    if (!wo.ok) throw new Error("wo");
    expect(cancelWorkOrder(db, { workOrderId: wo.workOrderId, by: "shop" }).ok).toBe(
      true,
    );
    expect(
      completeWorkOrder(db, { workOrderId: wo.workOrderId, by: "shop" }).ok,
    ).toBe(false);
  });

  it("opens work orders for make-part shortages only", () => {
    const make = makePart(db, "INJ-100", "A", { sourcing: "make" }).revId;
    const buy = makePart(db, "VLV-001").revId;
    const configId = makeConfig(db, "THR-50N-A", { status: "released" });
    addBomLine(db, configId, make, 1, "10");
    addBomLine(db, configId, buy, 1, "20");
    const result = openWorkOrdersForShortages(db, { configId, by: "shop" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toHaveLength(1);
    expect(result.created[0].partNumber).toBe("INJ-100");
  });
});
