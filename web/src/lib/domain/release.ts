import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { propagateStaleness } from "./staleness";

export type ReleaseInput = {
  configId: string;
  by: string;
  reviewer?: string;
};

export type ReleaseResult =
  | { ok: true; supersededKey: string | null; staleCount: number }
  | { ok: false; error: string };

// Releasing a cut config supersedes its base and marks now-stale evidence,
// atomically: the bench never sees a released N+1 with a still-live N.
export function releaseConfiguration(db: Db, input: ReleaseInput): ReleaseResult {
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, input.configId))
    .get();
  if (!config) return { ok: false, error: "Configuration not found." };
  if (config.status !== "draft") {
    return { ok: false, error: `Only draft configs can be released (status: ${config.status}).` };
  }

  const needsReviewer = config.riskClass === "R3";
  const reviewer = input.reviewer?.trim() ?? "";
  if (needsReviewer) {
    if (!reviewer) {
      return { ok: false, error: "R3 release requires a reviewer acknowledgment." };
    }
    if (reviewer === input.by) {
      return { ok: false, error: "R3 reviewer must be someone other than the releaser." };
    }
  }

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
        reviewerAckBy: needsReviewer ? reviewer : config.reviewerAckBy,
        reviewerAckAt: needsReviewer ? now : config.reviewerAckAt,
      })
      .where(eq(s.configurations.id, input.configId))
      .run();

    if (base && base.status === "released") {
      tx.update(s.configurations)
        .set({ status: "superseded" })
        .where(eq(s.configurations.id, base.id))
        .run();
      supersededKey = base.key;
    }

    staleCount = propagateStaleness(tx, input.configId);
  });

  return { ok: true, supersededKey, staleCount };
}
