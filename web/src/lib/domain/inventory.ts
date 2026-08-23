import { and, eq } from "drizzle-orm";
import type { Db, DbOrTx } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

export type StockResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function availableQty(lot: {
  qtyOnHand: number;
  qtyReserved: number;
}): number {
  return lot.qtyOnHand - lot.qtyReserved;
}

function recordMovement(
  tx: DbOrTx,
  input: {
    lotId: string;
    kind: (typeof s.movementKinds)[number];
    qty: number;
    reason: string;
    by: string;
    refType?: string;
    refId?: string;
  },
) {
  tx.insert(s.inventoryMovements)
    .values({
      id: id("mv"),
      lotId: input.lotId,
      kind: input.kind,
      qty: input.qty,
      reason: input.reason,
      by: input.by,
      refType: input.refType ?? "",
      refId: input.refId ?? "",
    })
    .run();
}

export function createLot(
  db: DbOrTx,
  input: {
    partRevisionId: string;
    qty: number;
    lotCode: string;
    location: string;
    by: string;
    reason?: string;
  },
): StockResult<{ lotId: string }> {
  const rev = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.id, input.partRevisionId))
    .get();
  if (!rev) return { ok: false, error: "Part revision not found." };
  const lotCode = input.lotCode.trim();
  if (!lotCode) return { ok: false, error: "Lot code is required." };
  if (input.qty < 0) return { ok: false, error: "Quantity cannot be negative." };

  const duplicate = db
    .select({ id: s.inventoryLots.id })
    .from(s.inventoryLots)
    .where(
      and(
        eq(s.inventoryLots.partRevisionId, input.partRevisionId),
        eq(s.inventoryLots.lotCode, lotCode),
      ),
    )
    .get();
  if (duplicate) {
    return {
      ok: false,
      error: `Lot "${lotCode}" already exists for this revision — adjust it instead.`,
    };
  }

  const lotId = id("inv");
  db.insert(s.inventoryLots)
    .values({
      id: lotId,
      partRevisionId: input.partRevisionId,
      qtyOnHand: input.qty,
      qtyReserved: 0,
      location: input.location.trim() || "CAGE",
      lotCode,
    })
    .run();
  if (input.qty > 0) {
    recordMovement(db, {
      lotId,
      kind: "receive",
      qty: input.qty,
      reason: input.reason ?? "Create lot",
      by: input.by,
    });
  }
  return { ok: true, lotId };
}

export function adjustLot(
  db: Db,
  input: { lotId: string; qtyDelta: number; by: string; reason: string },
): StockResult {
  if (input.qtyDelta === 0) return { ok: false, error: "Adjustment cannot be zero." };
  if (!input.reason.trim()) return { ok: false, error: "Reason is required." };

  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };

  const next = lot.qtyOnHand + input.qtyDelta;
  if (next < lot.qtyReserved) {
    return {
      ok: false,
      error: `Cannot take on-hand below reserved (${lot.qtyReserved}).`,
    };
  }
  if (next < 0) return { ok: false, error: "On-hand cannot go negative." };

  db.transaction((tx) => {
    tx.update(s.inventoryLots)
      .set({ qtyOnHand: next })
      .where(eq(s.inventoryLots.id, input.lotId))
      .run();
    recordMovement(tx, {
      lotId: input.lotId,
      kind: "adjust",
      qty: input.qtyDelta,
      reason: input.reason,
      by: input.by,
    });
  });
  return { ok: true };
}

export function findLotByCode(
  db: DbOrTx,
  partRevisionId: string,
  lotCode: string,
) {
  const code = lotCode.trim();
  if (!code) return undefined;
  const lots = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.partRevisionId, partRevisionId))
    .all();
  return lots.find((l) => l.lotCode.toLowerCase() === code.toLowerCase());
}

export function consumeLot(
  db: DbOrTx,
  input: {
    lotId: string;
    qty: number;
    by: string;
    reason: string;
    kind?: "issue" | "kit_issue";
    refType?: string;
    refId?: string;
  },
): StockResult {
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };
  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };
  if (availableQty(lot) < input.qty) {
    return {
      ok: false,
      error: `Lot ${lot.lotCode} has ${availableQty(lot)} available, need ${input.qty}.`,
    };
  }

  db.update(s.inventoryLots)
    .set({ qtyOnHand: lot.qtyOnHand - input.qty })
    .where(eq(s.inventoryLots.id, input.lotId))
    .run();
  recordMovement(db, {
    lotId: input.lotId,
    kind: input.kind ?? "issue",
    qty: -input.qty,
    reason: input.reason,
    by: input.by,
    refType: input.refType,
    refId: input.refId,
  });
  return { ok: true };
}

export function restockLot(
  db: DbOrTx,
  input: {
    lotId: string;
    qty: number;
    by: string;
    reason: string;
    refType?: string;
    refId?: string;
  },
): StockResult {
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };
  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };

  db.update(s.inventoryLots)
    .set({ qtyOnHand: lot.qtyOnHand + input.qty })
    .where(eq(s.inventoryLots.id, input.lotId))
    .run();
  recordMovement(db, {
    lotId: input.lotId,
    kind: "adjust",
    qty: input.qty,
    reason: input.reason,
    by: input.by,
    refType: input.refType,
    refId: input.refId,
  });
  return { ok: true };
}

export function reserveLot(
  db: DbOrTx,
  input: {
    lotId: string;
    qty: number;
    by: string;
    reason: string;
    refType?: string;
    refId?: string;
  },
): StockResult {
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };
  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };
  if (availableQty(lot) < input.qty) {
    return {
      ok: false,
      error: `Lot ${lot.lotCode} has ${availableQty(lot)} available, need ${input.qty}.`,
    };
  }
  db.update(s.inventoryLots)
    .set({ qtyReserved: lot.qtyReserved + input.qty })
    .where(eq(s.inventoryLots.id, input.lotId))
    .run();
  recordMovement(db, {
    lotId: input.lotId,
    kind: "reserve",
    qty: input.qty,
    reason: input.reason,
    by: input.by,
    refType: input.refType,
    refId: input.refId,
  });
  return { ok: true };
}

export function unreserveLot(
  db: DbOrTx,
  input: {
    lotId: string;
    qty: number;
    by: string;
    reason: string;
    refType?: string;
    refId?: string;
  },
): StockResult {
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };
  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };
  if (lot.qtyReserved < input.qty) {
    return { ok: false, error: "Cannot unreserve more than is reserved." };
  }
  db.update(s.inventoryLots)
    .set({ qtyReserved: lot.qtyReserved - input.qty })
    .where(eq(s.inventoryLots.id, input.lotId))
    .run();
  recordMovement(db, {
    lotId: input.lotId,
    kind: "unreserve",
    qty: -input.qty,
    reason: input.reason,
    by: input.by,
    refType: input.refType,
    refId: input.refId,
  });
  return { ok: true };
}

export function issueReserved(
  db: DbOrTx,
  input: {
    lotId: string;
    qty: number;
    by: string;
    reason: string;
    refType?: string;
    refId?: string;
  },
): StockResult {
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };
  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };
  if (lot.qtyReserved < input.qty || lot.qtyOnHand < input.qty) {
    return {
      ok: false,
      error: `Lot ${lot.lotCode} cannot issue ${input.qty} (on hand ${lot.qtyOnHand}, reserved ${lot.qtyReserved}).`,
    };
  }
  db.update(s.inventoryLots)
    .set({
      qtyOnHand: lot.qtyOnHand - input.qty,
      qtyReserved: lot.qtyReserved - input.qty,
    })
    .where(eq(s.inventoryLots.id, input.lotId))
    .run();
  recordMovement(db, {
    lotId: input.lotId,
    kind: "kit_issue",
    qty: -input.qty,
    reason: input.reason,
    by: input.by,
    refType: input.refType,
    refId: input.refId,
  });
  return { ok: true };
}

export function addToLot(
  db: DbOrTx,
  input: {
    lotId: string;
    qty: number;
    by: string;
    reason: string;
    refType?: string;
    refId?: string;
  },
): StockResult {
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };
  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };
  db.update(s.inventoryLots)
    .set({ qtyOnHand: lot.qtyOnHand + input.qty })
    .where(eq(s.inventoryLots.id, input.lotId))
    .run();
  recordMovement(db, {
    lotId: input.lotId,
    kind: "receive",
    qty: input.qty,
    reason: input.reason,
    by: input.by,
    refType: input.refType,
    refId: input.refId,
  });
  return { ok: true };
}

export type StockSummary = {
  partRevisionId: string;
  onHand: number;
  reserved: number;
  available: number;
};

export function stockByRevision(db: DbOrTx): Map<string, StockSummary> {
  const lots = db.select().from(s.inventoryLots).all();
  const map = new Map<string, StockSummary>();
  for (const lot of lots) {
    const existing = map.get(lot.partRevisionId) ?? {
      partRevisionId: lot.partRevisionId,
      onHand: 0,
      reserved: 0,
      available: 0,
    };
    existing.onHand += lot.qtyOnHand;
    existing.reserved += lot.qtyReserved;
    existing.available += availableQty(lot);
    map.set(lot.partRevisionId, existing);
  }
  return map;
}

export function inboundByRevision(db: DbOrTx): Map<string, number> {
  const lines = db
    .select({
      partRevisionId: s.purchaseOrderLines.partRevisionId,
      qty: s.purchaseOrderLines.qty,
      status: s.purchaseOrders.status,
    })
    .from(s.purchaseOrderLines)
    .innerJoin(
      s.purchaseOrders,
      eq(s.purchaseOrderLines.purchaseOrderId, s.purchaseOrders.id),
    )
    .all();
  const map = new Map<string, number>();
  for (const line of lines) {
    if (line.status === "received") continue;
    map.set(line.partRevisionId, (map.get(line.partRevisionId) ?? 0) + line.qty);
  }
  return map;
}

export function workOrderInboundByRevision(db: DbOrTx): Map<string, number> {
  const orders = db.select().from(s.workOrders).all();
  const map = new Map<string, number>();
  for (const wo of orders) {
    if (wo.status !== "open" && wo.status !== "in_progress") continue;
    map.set(wo.partRevisionId, (map.get(wo.partRevisionId) ?? 0) + wo.qty);
  }
  return map;
}
