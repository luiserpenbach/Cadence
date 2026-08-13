import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { shortagesForConfig } from "../impact";
import { createLot } from "./inventory";

export type WoResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function nextWorkOrderKey(db: Db): string {
  const rows = db.select({ key: s.workOrders.key }).from(s.workOrders).all();
  let max = 0;
  for (const row of rows) {
    const m = /^WO-(\d+)$/.exec(row.key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `WO-${String(max + 1).padStart(3, "0")}`;
}

export function createWorkOrder(
  db: Db,
  input: {
    partRevisionId: string;
    qty: number;
    by: string;
    location?: string;
    lotCode?: string;
    notes?: string;
  },
): WoResult<{ workOrderId: string; key: string }> {
  const rev = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.id, input.partRevisionId))
    .get();
  if (!rev) return { ok: false, error: "Part revision not found." };
  const part = db.select().from(s.parts).where(eq(s.parts.id, rev.partId)).get();
  if (!part) return { ok: false, error: "Part not found." };
  if (part.sourcing !== "make") {
    return { ok: false, error: "Work orders are for make parts. Buy/cots go on a PO." };
  }
  if (!(input.qty > 0)) return { ok: false, error: "Quantity must be positive." };

  const key = nextWorkOrderKey(db);
  const workOrderId = id("wo");
  db.insert(s.workOrders)
    .values({
      id: workOrderId,
      key,
      partRevisionId: input.partRevisionId,
      qty: input.qty,
      status: "open",
      location: input.location?.trim() || "SHOP",
      lotCode: input.lotCode?.trim() || "",
      notes: input.notes?.trim() || "",
      createdBy: input.by,
    })
    .run();
  return { ok: true, workOrderId, key };
}

export function completeWorkOrder(
  db: Db,
  input: { workOrderId: string; by: string; lotCode?: string; location?: string },
): WoResult<{ lotId: string }> {
  const wo = db
    .select()
    .from(s.workOrders)
    .where(eq(s.workOrders.id, input.workOrderId))
    .get();
  if (!wo) return { ok: false, error: "Work order not found." };
  if (wo.status === "complete") return { ok: false, error: "Work order already complete." };
  if (wo.status === "cancelled") return { ok: false, error: "Work order is cancelled." };

  const rev = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.id, wo.partRevisionId))
    .get()!;
  const part = db.select().from(s.parts).where(eq(s.parts.id, rev.partId)).get()!;
  const lotCode =
    input.lotCode?.trim() || wo.lotCode.trim() || `${wo.key}-${part.partNumber}@${rev.revision}`;
  const location = input.location?.trim() || wo.location || "SHOP";

  const lot = createLot(db, {
    partRevisionId: wo.partRevisionId,
    qty: wo.qty,
    lotCode,
    location,
    by: input.by,
    reason: `Complete ${wo.key}`,
  });
  if (!lot.ok) return lot;

  db.update(s.workOrders)
    .set({
      status: "complete",
      lotCode,
      location,
      lotId: lot.lotId,
      completedAt: new Date().toISOString(),
      completedBy: input.by,
    })
    .where(eq(s.workOrders.id, wo.id))
    .run();
  return { ok: true, lotId: lot.lotId };
}

export function cancelWorkOrder(
  db: Db,
  input: { workOrderId: string; by: string },
): WoResult {
  const wo = db
    .select()
    .from(s.workOrders)
    .where(eq(s.workOrders.id, input.workOrderId))
    .get();
  if (!wo) return { ok: false, error: "Work order not found." };
  if (wo.status === "complete") {
    return { ok: false, error: "Completed work orders cannot be cancelled." };
  }
  if (wo.status === "cancelled") return { ok: false, error: "Already cancelled." };
  db.update(s.workOrders)
    .set({
      status: "cancelled",
      notes: [wo.notes, `cancelled by ${input.by}`].filter(Boolean).join(" · "),
    })
    .where(eq(s.workOrders.id, wo.id))
    .run();
  return { ok: true };
}

export function openWorkOrdersForShortages(
  db: Db,
  input: { configId: string; by: string },
): WoResult<{ created: Array<{ key: string; partNumber: string; qty: number }> }> {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };

  const shorts = shortagesForConfig(config.id, 1).filter((row) => row.short > 0);
  const created: Array<{ key: string; partNumber: string; qty: number }> = [];
  for (const row of shorts) {
    const rev = db
      .select()
      .from(s.partRevisions)
      .where(eq(s.partRevisions.id, row.partRevisionId))
      .get();
    if (!rev) continue;
    const part = db.select().from(s.parts).where(eq(s.parts.id, rev.partId)).get();
    if (!part || part.sourcing !== "make") continue;
    const wo = createWorkOrder(db, {
      partRevisionId: row.partRevisionId,
      qty: row.short,
      by: input.by,
      notes: `Shortage for ${config.key}`,
    });
    if (wo.ok) created.push({ key: wo.key, partNumber: part.partNumber, qty: row.short });
  }
  if (created.length === 0) {
    return { ok: false, error: "No make-part shortages to issue work orders for." };
  }
  return { ok: true, created };
}
