import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { getConfigBom } from "../impact";
import { issueReserved, reserveLot, unreserveLot, availableQty } from "./inventory";

export type KitResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function uniqueKitKey(db: Db, articleSerial: string, configKey: string): string {
  const base = `KIT-${articleSerial}-${configKey}`;
  let candidate = base;
  let n = 2;
  while (
    db.select({ id: s.kits.id }).from(s.kits).where(eq(s.kits.key, candidate)).get()
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function createKit(
  db: Db,
  input: { articleId: string; configId: string; by: string; notes?: string },
): KitResult<{ kitId: string; key: string }> {
  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, input.articleId))
    .get();
  if (!article) return { ok: false, error: "Article not found." };
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "released") {
    return { ok: false, error: "Kits can only be pulled from a released config." };
  }

  const bom = getConfigBom(config.id);
  if (bom.length === 0) {
    return { ok: false, error: "Config has no BoM pins to kit." };
  }

  const kitId = id("kit");
  const key = uniqueKitKey(db, article.serial, config.key);

  db.transaction((tx) => {
    tx.insert(s.kits)
      .values({
        id: kitId,
        key,
        articleId: article.id,
        configId: config.id,
        status: "open",
        notes: input.notes ?? "",
        createdBy: input.by,
      })
      .run();
    for (const line of bom) {
      tx.insert(s.kitLines)
        .values({
          id: id("kl"),
          kitId,
          partRevisionId: line.partRevisionId,
          findNumber: line.findNumber,
          qty: line.qty,
          lotId: null,
        })
        .run();
    }
  });
  return { ok: true, kitId, key };
}

function allowedRevIds(db: Db, kit: typeof s.kits.$inferSelect, pinRevId: string): Set<string> {
  const allowed = new Set<string>([pinRevId]);
  const bomLine = db
    .select()
    .from(s.configBomLines)
    .where(eq(s.configBomLines.configId, kit.configId))
    .all()
    .find((l) => l.partRevisionId === pinRevId);
  if (!bomLine) return allowed;
  const alts = db
    .select()
    .from(s.configBomAlternates)
    .where(eq(s.configBomAlternates.bomLineId, bomLine.id))
    .all();
  for (const a of alts) allowed.add(a.partRevisionId);
  return allowed;
}

export function allocateKitLine(
  db: Db,
  input: { kitLineId: string; lotId: string; by: string },
): KitResult {
  const line = db
    .select()
    .from(s.kitLines)
    .where(eq(s.kitLines.id, input.kitLineId))
    .get();
  if (!line) return { ok: false, error: "Kit line not found." };
  const kit = db.select().from(s.kits).where(eq(s.kits.id, line.kitId)).get();
  if (!kit) return { ok: false, error: "Kit not found." };
  if (kit.status === "issued" || kit.status === "cancelled") {
    return { ok: false, error: `Kit is ${kit.status} and cannot be allocated.` };
  }

  const lot = db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.id, input.lotId))
    .get();
  if (!lot) return { ok: false, error: "Lot not found." };

  const allowed = allowedRevIds(db, kit, line.partRevisionId);
  if (!allowed.has(lot.partRevisionId)) {
    return {
      ok: false,
      error: "Lot is not the pinned rev or an allowed alternate.",
    };
  }

  db.transaction((tx) => {
    if (line.lotId) {
      const released = unreserveLot(tx, {
        lotId: line.lotId,
        qty: line.qty,
        by: input.by,
        reason: `Reallocate ${kit.key}`,
        refType: "kit",
        refId: kit.id,
      });
      if (!released.ok) throw new Error(released.error);
    }
    const reserved = reserveLot(tx, {
      lotId: lot.id,
      qty: line.qty,
      by: input.by,
      reason: `Reserve for ${kit.key}`,
      refType: "kit",
      refId: kit.id,
    });
    if (!reserved.ok) throw new Error(reserved.error);
    tx.update(s.kitLines)
      .set({ lotId: lot.id })
      .where(eq(s.kitLines.id, line.id))
      .run();

    const lines = tx
      .select()
      .from(s.kitLines)
      .where(eq(s.kitLines.kitId, kit.id))
      .all();
    const allAllocated = lines.every((l) =>
      l.id === line.id ? true : Boolean(l.lotId),
    );
    if (allAllocated && kit.status === "open") {
      tx.update(s.kits)
        .set({ status: "reserved" })
        .where(eq(s.kits.id, kit.id))
        .run();
    }
  });
  return { ok: true };
}

function pickLotForLine(
  db: Db,
  kit: typeof s.kits.$inferSelect,
  line: typeof s.kitLines.$inferSelect,
) {
  const allowed = allowedRevIds(db, kit, line.partRevisionId);
  return db
    .select()
    .from(s.inventoryLots)
    .all()
    .filter((lot) => allowed.has(lot.partRevisionId) && availableQty(lot) >= line.qty)
    .sort(
      (a, b) =>
        availableQty(b) - availableQty(a) || a.lotCode.localeCompare(b.lotCode),
    )[0];
}

export function unallocateKitLine(
  db: Db,
  input: { kitLineId: string; by: string },
): KitResult {
  const line = db
    .select()
    .from(s.kitLines)
    .where(eq(s.kitLines.id, input.kitLineId))
    .get();
  if (!line) return { ok: false, error: "Kit line not found." };
  if (!line.lotId) return { ok: false, error: "Line is not allocated." };
  const kit = db.select().from(s.kits).where(eq(s.kits.id, line.kitId)).get();
  if (!kit) return { ok: false, error: "Kit not found." };
  if (kit.status === "issued" || kit.status === "cancelled") {
    return { ok: false, error: `Kit is ${kit.status} and cannot be unallocated.` };
  }

  db.transaction((tx) => {
    const released = unreserveLot(tx, {
      lotId: line.lotId!,
      qty: line.qty,
      by: input.by,
      reason: `Unallocate ${kit.key}`,
      refType: "kit",
      refId: kit.id,
    });
    if (!released.ok) throw new Error(released.error);
    tx.update(s.kitLines)
      .set({ lotId: null })
      .where(eq(s.kitLines.id, line.id))
      .run();
    if (kit.status === "reserved") {
      tx.update(s.kits)
        .set({ status: "open" })
        .where(eq(s.kits.id, kit.id))
        .run();
    }
  });
  return { ok: true };
}

export function allocateRemaining(
  db: Db,
  input: { kitId: string; by: string },
): KitResult<{ allocated: number; skipped: number }> {
  const kit = db.select().from(s.kits).where(eq(s.kits.id, input.kitId)).get();
  if (!kit) return { ok: false, error: "Kit not found." };
  if (kit.status === "issued" || kit.status === "cancelled") {
    return { ok: false, error: `Kit is ${kit.status} and cannot be allocated.` };
  }

  const lines = db
    .select()
    .from(s.kitLines)
    .where(eq(s.kitLines.kitId, kit.id))
    .all();

  let allocated = 0;
  let skipped = 0;
  for (const line of lines) {
    if (line.lotId) continue;
    const lot = pickLotForLine(db, kit, line);
    if (!lot) {
      skipped++;
      continue;
    }
    const result = allocateKitLine(db, {
      kitLineId: line.id,
      lotId: lot.id,
      by: input.by,
    });
    if (!result.ok) skipped++;
    else allocated++;
  }

  if (allocated === 0 && skipped > 0) {
    return {
      ok: false,
      error: "No matching lots with enough available qty for the open lines.",
    };
  }
  return { ok: true, allocated, skipped };
}

export function issueKit(
  db: Db,
  input: { kitId: string; by: string },
): KitResult {
  const kit = db.select().from(s.kits).where(eq(s.kits.id, input.kitId)).get();
  if (!kit) return { ok: false, error: "Kit not found." };
  if (kit.status === "issued") return { ok: false, error: "Kit already issued." };
  if (kit.status === "cancelled") return { ok: false, error: "Kit is cancelled." };

  const lines = db
    .select()
    .from(s.kitLines)
    .where(eq(s.kitLines.kitId, kit.id))
    .all();
  if (lines.some((l) => !l.lotId)) {
    return { ok: false, error: "Allocate a lot on every kit line before issuing." };
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const line of lines) {
      const issued = issueReserved(tx, {
        lotId: line.lotId!,
        qty: line.qty,
        by: input.by,
        reason: `Issue ${kit.key}`,
        refType: "kit",
        refId: kit.id,
      });
      if (!issued.ok) throw new Error(issued.error);

      const lot = tx
        .select()
        .from(s.inventoryLots)
        .where(eq(s.inventoryLots.id, line.lotId!))
        .get()!;
      tx.insert(s.asBuiltLines)
        .values({
          id: id("ab"),
          articleId: kit.articleId,
          partRevisionId: lot.partRevisionId,
          qty: line.qty,
          serialOrLot: lot.lotCode,
          lotId: lot.id,
          notes: `Issued from ${kit.key}`,
        })
        .run();
    }
    tx.update(s.kits)
      .set({ status: "issued", issuedAt: now, issuedBy: input.by })
      .where(eq(s.kits.id, kit.id))
      .run();
  });
  return { ok: true };
}

export function cancelKit(
  db: Db,
  input: { kitId: string; by: string },
): KitResult {
  const kit = db.select().from(s.kits).where(eq(s.kits.id, input.kitId)).get();
  if (!kit) return { ok: false, error: "Kit not found." };
  if (kit.status === "issued") {
    return { ok: false, error: "Issued kits cannot be cancelled — reverse as-built instead." };
  }
  if (kit.status === "cancelled") return { ok: false, error: "Kit already cancelled." };

  const lines = db
    .select()
    .from(s.kitLines)
    .where(eq(s.kitLines.kitId, kit.id))
    .all();
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const line of lines) {
      if (!line.lotId) continue;
      const released = unreserveLot(tx, {
        lotId: line.lotId,
        qty: line.qty,
        by: input.by,
        reason: `Cancel ${kit.key}`,
        refType: "kit",
        refId: kit.id,
      });
      if (!released.ok) throw new Error(released.error);
      tx.update(s.kitLines)
        .set({ lotId: null })
        .where(eq(s.kitLines.id, line.id))
        .run();
    }
    tx.update(s.kits)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: input.by,
      })
      .where(eq(s.kits.id, kit.id))
      .run();
  });
  return { ok: true };
}
