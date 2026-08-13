import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { propagateStaleness } from "./staleness";

type Configuration = typeof s.configurations.$inferSelect;

export type ReleaseResult =
  | { ok: true; supersededKey: string | null; staleCount: number }
  | { ok: false; error: string };

// Shared tail of every release path: flip to released, optionally supersede
// the base, and mark now-stale evidence — atomically.
function finalizeRelease(
  db: Db,
  config: Configuration,
  input: { by: string; reviewer?: string; supersedeBase: boolean },
): ReleaseResult {
  const base = config.basedOnConfigId
    ? db
        .select()
        .from(s.configurations)
        .where(eq(s.configurations.id, config.basedOnConfigId))
        .get()
    : undefined;

  const now = new Date().toISOString();
  let supersededKey: string | null = null;
  let staleCount = 0;

  db.transaction((tx) => {
    tx.update(s.configurations)
      .set({
        status: "released",
        releasedAt: now,
        releasedBy: input.by,
        reviewerAckBy: input.reviewer ?? config.reviewerAckBy,
        reviewerAckAt: input.reviewer ? now : config.reviewerAckAt,
      })
      .where(eq(s.configurations.id, config.id))
      .run();

    // Partial cut-in (CONCEPT §11 hard problem #2): the releaser chooses.
    // Superseding retires the base everywhere; keeping it released leaves
    // earlier serials bindable, with partitioned effectivity as the
    // designer's responsibility (overlaps surface as resolver conflicts).
    if (input.supersedeBase && base && base.status === "released") {
      tx.update(s.configurations)
        .set({ status: "superseded" })
        .where(eq(s.configurations.id, base.id))
        .run();
      supersededKey = base.key;
    }

    staleCount = propagateStaleness(tx, config.id);
  });

  return { ok: true, supersededKey, staleCount };
}

// Direct release for R0–R2. R3 must go through requestRelease/approveRelease.
export function releaseConfiguration(
  db: Db,
  input: { configId: string; by: string; supersedeBase?: boolean },
): ReleaseResult {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "draft") {
    return { ok: false, error: `Only draft configs can be released (status: ${config.status}).` };
  }
  if (config.riskClass === "R3") {
    return {
      ok: false,
      error: "R3 configs require reviewer approval — request release instead.",
    };
  }

  return finalizeRelease(db, config, {
    by: input.by,
    supersedeBase: input.supersedeBase ?? false,
  });
}

export type ReviewResult = { ok: true } | { ok: false; error: string };

export function requestRelease(
  db: Db,
  input: { configId: string; by: string },
): ReviewResult {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "draft") {
    return { ok: false, error: `Only draft configs can request release (status: ${config.status}).` };
  }
  if (config.riskClass !== "R3") {
    return { ok: false, error: "Only R3 configs use the review flow — release directly." };
  }

  db.update(s.configurations)
    .set({
      status: "in_review",
      releaseRequestedBy: input.by,
      releaseRequestedAt: new Date().toISOString(),
    })
    .where(eq(s.configurations.id, input.configId))
    .run();
  return { ok: true };
}

export function approveRelease(
  db: Db,
  input: { configId: string; reviewer: string; supersedeBase?: boolean },
): ReleaseResult {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "in_review") {
    return { ok: false, error: `No pending release request (status: ${config.status}).` };
  }
  if (!config.releaseRequestedBy) {
    return { ok: false, error: "Release request is missing its requester." };
  }
  if (input.reviewer === config.releaseRequestedBy) {
    return { ok: false, error: "Reviewer must be someone other than the requester." };
  }

  return finalizeRelease(db, config, {
    by: config.releaseRequestedBy,
    reviewer: input.reviewer,
    supersedeBase: input.supersedeBase ?? false,
  });
}

export function returnToDraft(
  db: Db,
  input: { configId: string },
): ReviewResult {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "in_review") {
    return { ok: false, error: `Only in-review configs can return to draft (status: ${config.status}).` };
  }

  db.update(s.configurations)
    .set({
      status: "draft",
      releaseRequestedBy: null,
      releaseRequestedAt: null,
    })
    .where(eq(s.configurations.id, input.configId))
    .run();
  return { ok: true };
}
