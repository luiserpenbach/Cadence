import { and, eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

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
