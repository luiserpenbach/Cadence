import { and, eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { categoryNotAllowed } from "./catalog-settings";

export type AuthoringResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function createPart(
  db: Db,
  input: {
    partNumber: string;
    name: string;
    category: string;
    revision: string;
    sourcing?: string;
    kind?: string;
    description?: string;
  },
): AuthoringResult<{ partId: string }> {
  const duplicate = db
    .select({ id: s.parts.id })
    .from(s.parts)
    .where(eq(s.parts.partNumber, input.partNumber))
    .get();
  if (duplicate) {
    return { ok: false, error: `Part number "${input.partNumber}" already exists.` };
  }

  const categoryError = categoryNotAllowed(db, input.category);
  if (categoryError) return { ok: false, error: categoryError };

  const partId = id("part");
  db.transaction((tx) => {
    tx.insert(s.parts)
      .values({
        id: partId,
        partNumber: input.partNumber,
        name: input.name,
        category: input.category,
        sourcing: input.sourcing ?? "buy",
        kind: input.kind ?? "component",
        description: input.description ?? "",
      })
      .run();
    tx.insert(s.partRevisions)
      .values({ id: id("rev"), partId, revision: input.revision })
      .run();
  });
  return { ok: true, partId };
}

export function addPartRevision(
  db: Db,
  input: { partId: string; revision: string; notes: string },
): AuthoringResult {
  const part = db
    .select()
    .from(s.parts)
    .where(eq(s.parts.id, input.partId))
    .get();
  if (!part) return { ok: false, error: "Part not found." };

  const duplicate = db
    .select({ id: s.partRevisions.id })
    .from(s.partRevisions)
    .where(
      and(
        eq(s.partRevisions.partId, input.partId),
        eq(s.partRevisions.revision, input.revision),
      ),
    )
    .get();
  if (duplicate) {
    return {
      ok: false,
      error: `${part.partNumber} rev ${input.revision} already exists.`,
    };
  }

  db.insert(s.partRevisions)
    .values({
      id: id("rev"),
      partId: input.partId,
      revision: input.revision,
      notes: input.notes,
    })
    .run();
  return { ok: true };
}

export function updatePart(
  db: Db,
  input: {
    partId: string;
    name: string;
    category: string;
    sourcing: string;
    kind: string;
    description: string;
  },
): AuthoringResult {
  const part = db
    .select()
    .from(s.parts)
    .where(eq(s.parts.id, input.partId))
    .get();
  if (!part) return { ok: false, error: "Part not found." };
  if (!input.name.trim()) return { ok: false, error: "Name is required." };

  const categoryError = categoryNotAllowed(db, input.category, part.category);
  if (categoryError) return { ok: false, error: categoryError };

  db.update(s.parts)
    .set({
      name: input.name.trim(),
      category: input.category.trim() || part.category,
      sourcing: input.sourcing,
      kind: input.kind,
      description: input.description.trim(),
    })
    .where(eq(s.parts.id, input.partId))
    .run();
  return { ok: true };
}

export function deleteParts(
  db: Db,
  partIds: string[],
  storageDir?: string,
): AuthoringResult<{
  deleted: string[];
  skipped: Array<{ partNumber: string; error: string }>;
}> {
  const unique = [...new Set(partIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { ok: false, error: "No parts selected." };

  const deleted: string[] = [];
  const skipped: Array<{ partNumber: string; error: string }> = [];

  for (const partId of unique) {
    const part = db
      .select()
      .from(s.parts)
      .where(eq(s.parts.id, partId))
      .get();
    if (!part) {
      skipped.push({ partNumber: partId, error: "Part not found." });
      continue;
    }
    const blocker = partDeleteBlocker(db, partId);
    if (blocker) {
      skipped.push({ partNumber: part.partNumber, error: blocker });
      continue;
    }

    const files = db
      .select()
      .from(s.attachments)
      .where(
        and(eq(s.attachments.entityType, "part"), eq(s.attachments.entityId, partId)),
      )
      .all()
      .filter((a) => a.kind === "file");

    db.transaction((tx) => {
      tx.delete(s.attachments)
        .where(
          and(
            eq(s.attachments.entityType, "part"),
            eq(s.attachments.entityId, partId),
          ),
        )
        .run();
      tx.delete(s.partRevisions)
        .where(eq(s.partRevisions.partId, partId))
        .run();
      tx.delete(s.parts).where(eq(s.parts.id, partId)).run();
    });

    if (storageDir) {
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(storageDir, file.id));
        } catch {
          // row removal is the source of truth
        }
      }
    }
    deleted.push(part.partNumber);
  }

  if (deleted.length === 0) {
    return {
      ok: false,
      error: skipped
        .map((row) => `${row.partNumber}: ${row.error}`)
        .join(" "),
    };
  }
  return { ok: true, deleted, skipped };
}

function partDeleteBlocker(db: Db, partId: string): string | null {
  const revIds = db
    .select({ id: s.partRevisions.id })
    .from(s.partRevisions)
    .where(eq(s.partRevisions.partId, partId))
    .all()
    .map((r) => r.id);
  if (revIds.length === 0) return null;

  if (
    db
      .select({ id: s.configBomLines.id })
      .from(s.configBomLines)
      .where(inArray(s.configBomLines.partRevisionId, revIds))
      .get()
  ) {
    return "used in a configuration BOM";
  }
  if (
    db
      .select({ id: s.configBomAlternates.id })
      .from(s.configBomAlternates)
      .where(inArray(s.configBomAlternates.partRevisionId, revIds))
      .get()
  ) {
    return "used as a BOM alternate";
  }
  if (
    db
      .select({ id: s.asBuiltLines.id })
      .from(s.asBuiltLines)
      .where(inArray(s.asBuiltLines.partRevisionId, revIds))
      .get()
  ) {
    return "recorded on an as-built";
  }
  if (
    db
      .select({ id: s.inventoryLots.id })
      .from(s.inventoryLots)
      .where(inArray(s.inventoryLots.partRevisionId, revIds))
      .get()
  ) {
    return "has inventory lots";
  }
  if (
    db
      .select({ id: s.kitLines.id })
      .from(s.kitLines)
      .where(inArray(s.kitLines.partRevisionId, revIds))
      .get()
  ) {
    return "used on a kit";
  }
  if (
    db
      .select({ id: s.workOrders.id })
      .from(s.workOrders)
      .where(inArray(s.workOrders.partRevisionId, revIds))
      .get()
  ) {
    return "has work orders";
  }
  if (
    db
      .select({ id: s.purchaseOrderLines.id })
      .from(s.purchaseOrderLines)
      .where(inArray(s.purchaseOrderLines.partRevisionId, revIds))
      .get()
  ) {
    return "used on a purchase order";
  }
  return null;
}

export function createArticle(
  db: Db,
  input: { serial: string; name: string },
): AuthoringResult<{ articleId: string }> {
  const duplicate = db
    .select({ id: s.articles.id })
    .from(s.articles)
    .where(eq(s.articles.serial, input.serial))
    .get();
  if (duplicate) {
    return { ok: false, error: `Serial "${input.serial}" already exists.` };
  }

  const articleId = id("art");
  db.insert(s.articles)
    .values({ id: articleId, serial: input.serial, name: input.name })
    .run();
  return { ok: true, articleId };
}

export function createStand(
  db: Db,
  input: { key: string; name: string; location: string },
): AuthoringResult<{ standId: string }> {
  const duplicate = db
    .select({ id: s.stands.id })
    .from(s.stands)
    .where(eq(s.stands.key, input.key))
    .get();
  if (duplicate) {
    return { ok: false, error: `Stand key "${input.key}" already exists.` };
  }

  const standId = id("stand");
  db.insert(s.stands)
    .values({
      id: standId,
      key: input.key,
      name: input.name,
      location: input.location,
    })
    .run();
  return { ok: true, standId };
}

export function createConfig(
  db: Db,
  input: {
    key: string;
    name: string;
    kind: string;
    riskClass: string;
    program?: string;
    envelope?: string;
  },
): AuthoringResult<{ configId: string }> {
  const duplicate = db
    .select({ id: s.configurations.id })
    .from(s.configurations)
    .where(eq(s.configurations.key, input.key))
    .get();
  if (duplicate) {
    return { ok: false, error: `Config key "${input.key}" already exists.` };
  }

  const configId = id("cfg");
  db.insert(s.configurations)
    .values({
      id: configId,
      key: input.key,
      name: input.name,
      kind: input.kind,
      status: "draft",
      riskClass: input.riskClass,
      program: input.program?.trim() ?? "",
      envelope: input.envelope?.trim() ?? "",
    })
    .run();
  return { ok: true, configId };
}
