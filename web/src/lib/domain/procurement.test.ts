import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { addBomLine, makeArticle, makeConfig, makePart } from "../../test/fixtures";
import {
  addPurchaseOrderLine,
  createPurchaseOrder,
  markPurchaseOrderOrdered,
  openPoForShortages,
  receivePurchaseOrder,
} from "./procurement";

describe("procurement", () => {
  let db: Db;
  let revId: string;

  beforeEach(() => {
    db = createTestDb();
    revId = makePart(db, "VLV-001").revId;
  });

  it("creates, orders, and receives a PO into a lot", () => {
    const po = createPurchaseOrder(db, {
      poNumber: "PO-1",
      supplier: "CryoFit",
      notes: "",
    });
    expect(po.ok).toBe(true);
    if (!po.ok) return;
    expect(
      addPurchaseOrderLine(db, {
        poId: po.poId,
        partRevisionId: revId,
        qty: 4,
        unitCost: 10,
      }).ok,
    ).toBe(true);
    expect(markPurchaseOrderOrdered(db, po.poId).ok).toBe(true);
    expect(receivePurchaseOrder(db, { poId: po.poId, by: "cage" }).ok).toBe(true);

    const stored = db.select().from(s.purchaseOrders).all()[0];
    expect(stored.status).toBe("received");
    expect(stored.receivedBy).toBe("cage");
    const lot = db.select().from(s.inventoryLots).all()[0];
    expect(lot.qtyOnHand).toBe(4);
    expect(lot.lotCode).toBe("PO-1-VLV-001@A");
  });

  it("rejects duplicate PO numbers and receive-twice", () => {
    createPurchaseOrder(db, { poNumber: "PO-1", supplier: "A", notes: "" });
    expect(
      createPurchaseOrder(db, { poNumber: "PO-1", supplier: "B", notes: "" }).ok,
    ).toBe(false);
  });

  it("opens a shortage PO from a config covering two articles", () => {
    const configId = makeConfig(db, "CFG-N", { status: "released" });
    addBomLine(db, configId, revId, 2, "10");
    db.insert(s.configEffectivity)
      .values({
        id: "eff1",
        configId,
        articleScope: "any",
        standScope: "any",
      })
      .run();
    makeArticle(db, "TP-1");
    makeArticle(db, "TP-2");

    const result = openPoForShortages(db, {
      configId,
      supplier: "CryoFit",
      by: "re",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = db
      .select()
      .from(s.purchaseOrderLines)
      .where(eq(s.purchaseOrderLines.purchaseOrderId, result.poId))
      .get()!;
    expect(line.qty).toBe(4);
  });
});
