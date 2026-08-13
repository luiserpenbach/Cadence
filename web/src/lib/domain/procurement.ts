import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { addToLot, createLot } from "./inventory";
import { shortagesForConfig } from "../impact";
import { configCoversArticle } from "./effectivity";

export type ProcResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function nextPoNumber(db: Db): string {
  const rows = db
    .select({ poNumber: s.purchaseOrders.poNumber })
    .from(s.purchaseOrders)
    .all();
  let max = 0;
  for (const row of rows) {
    const m = /^PO-(\d+)$/.exec(row.poNumber);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PO-${String(max + 1).padStart(3, "0")}`;
}

export function createPurchaseOrder(
  db: Db,
  input: { poNumber?: string; supplier: string; notes: string },
): ProcResult<{ poId: string; poNumber: string }> {
  const poNumber = input.poNumber?.trim() || nextPoNumber(db);
  const supplier = input.supplier.trim();
  if (!supplier) return { ok: false, error: "Supplier is required." };

  const duplicate = db
    .select({ id: s.purchaseOrders.id })
    .from(s.purchaseOrders)
    .where(eq(s.purchaseOrders.poNumber, poNumber))
    .get();
  if (duplicate) {
    return { ok: false, error: `PO "${poNumber}" already exists.` };
  }

  const poId = id("po");
  db.insert(s.purchaseOrders)
    .values({
      id: poId,
      poNumber,
      supplier,
      status: "open",
      notes: input.notes.trim(),
    })
    .run();
  return { ok: true, poId, poNumber };
}

export function addPurchaseOrderLine(
  db: Db,
  input: { poId: string; partRevisionId: string; qty: number; unitCost: number },
): ProcResult {
  const po = db
    .select()
    .from(s.purchaseOrders)
    .where(eq(s.purchaseOrders.id, input.poId))
    .get();
  if (!po) return { ok: false, error: "Purchase order not found." };
  if (po.status === "received") {
    return { ok: false, error: "Cannot add lines to a received PO." };
  }
  const rev = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.id, input.partRevisionId))
    .get();
  if (!rev) return { ok: false, error: "Part revision not found." };
  const part = db.select().from(s.parts).where(eq(s.parts.id, rev.partId)).get();
  if (part?.sourcing === "make") {
    return { ok: false, error: "Make parts go on a work order, not a PO." };
  }
  if (input.qty <= 0) return { ok: false, error: "Quantity must be positive." };
  if (input.unitCost < 0) return { ok: false, error: "Unit cost cannot be negative." };

  db.insert(s.purchaseOrderLines)
    .values({
      id: id("pol"),
      purchaseOrderId: input.poId,
      partRevisionId: input.partRevisionId,
      qty: input.qty,
      unitCost: input.unitCost,
    })
    .run();
  return { ok: true };
}

export function markPurchaseOrderOrdered(
  db: Db,
  poId: string,
): ProcResult {
  const po = db
    .select()
    .from(s.purchaseOrders)
    .where(eq(s.purchaseOrders.id, poId))
    .get();
  if (!po) return { ok: false, error: "Purchase order not found." };
  if (po.status !== "open") {
    return { ok: false, error: `PO is ${po.status}, not open.` };
  }
  const lines = db
    .select()
    .from(s.purchaseOrderLines)
    .where(eq(s.purchaseOrderLines.purchaseOrderId, poId))
    .all();
  if (lines.length === 0) {
    return { ok: false, error: "Add at least one line before ordering." };
  }
  db.update(s.purchaseOrders)
    .set({ status: "ordered" })
    .where(eq(s.purchaseOrders.id, poId))
    .run();
  return { ok: true };
}

export function receivePurchaseOrder(
  db: Db,
  input: {
    poId: string;
    by: string;
    location?: string;
    certUrl?: string;
    certNotes?: string;
  },
): ProcResult {
  const po = db
    .select()
    .from(s.purchaseOrders)
    .where(eq(s.purchaseOrders.id, input.poId))
    .get();
  if (!po) return { ok: false, error: "Purchase order not found." };
  if (po.status === "received") {
    return { ok: false, error: "PO is already received." };
  }
  const lines = db
    .select()
    .from(s.purchaseOrderLines)
    .where(eq(s.purchaseOrderLines.purchaseOrderId, po.id))
    .all();
  if (lines.length === 0) {
    return { ok: false, error: "PO has no lines to receive." };
  }

  const location = input.location?.trim() || "CAGE";
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const line of lines) {
      const rev = tx
        .select()
        .from(s.partRevisions)
        .where(eq(s.partRevisions.id, line.partRevisionId))
        .get()!;
      const part = tx
        .select()
        .from(s.parts)
        .where(eq(s.parts.id, rev.partId))
        .get()!;
      const lotCode = `${po.poNumber}-${part.partNumber}@${rev.revision}`;
      const existing = tx
        .select()
        .from(s.inventoryLots)
        .where(eq(s.inventoryLots.partRevisionId, line.partRevisionId))
        .all()
        .find((l) => l.lotCode === lotCode);

      if (existing) {
        const added = addToLot(tx, {
          lotId: existing.id,
          qty: line.qty,
          by: input.by,
          reason: `Receive ${po.poNumber}`,
          refType: "po",
          refId: po.id,
        });
        if (!added.ok) throw new Error(added.error);
      } else {
        const created = createLot(tx, {
          partRevisionId: line.partRevisionId,
          qty: line.qty,
          lotCode,
          location,
          by: input.by,
          reason: `Receive ${po.poNumber}`,
        });
        if (!created.ok) throw new Error(created.error);
      }
    }
    tx.update(s.purchaseOrders)
      .set({
        status: "received",
        receivedAt: now,
        receivedBy: input.by,
        certUrl: input.certUrl?.trim() ?? po.certUrl,
        certNotes: input.certNotes?.trim() ?? po.certNotes,
      })
      .where(eq(s.purchaseOrders.id, po.id))
      .run();
  });
  return { ok: true };
}

export function openPoForShortages(
  db: Db,
  input: {
    configId: string;
    supplier: string;
    by: string;
    kitCount?: number;
  },
): ProcResult<{ poId: string; poNumber: string; lineCount: number }> {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };

  const articles = db.select().from(s.articles).all();
  const covered = articles.filter((a) => configCoversArticle(db, config.id, a));
  const kitCount = input.kitCount ?? Math.max(covered.length, 1);
  const shorts = shortagesForConfig(config.id, kitCount).filter(
    (row) => row.short > 0 && row.sourcing !== "make",
  );
  if (shorts.length === 0) {
    return {
      ok: false,
      error: "No buy shortages — make parts need a work order, not a PO.",
    };
  }

  const created = createPurchaseOrder(db, {
    supplier: input.supplier,
    notes: `Shortage buy for ${kitCount} kit(s) of ${config.key} (${input.by})`,
  });
  if (!created.ok) return created;

  for (const short of shorts) {
    const added = addPurchaseOrderLine(db, {
      poId: created.poId,
      partRevisionId: short.partRevisionId,
      qty: short.short,
      unitCost: 0,
    });
    if (!added.ok) return added;
  }
  return {
    ok: true,
    poId: created.poId,
    poNumber: created.poNumber,
    lineCount: shorts.length,
  };
}
