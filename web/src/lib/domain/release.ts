import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";

export type ReleaseInput = {
  configId: string;
  by: string;
  reviewer?: string;
};

export type ReleaseResult =
  | { ok: true }
  | { ok: false; error: string };

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

  const now = new Date().toISOString();
  db.update(s.configurations)
    .set({
      status: "released",
      releasedAt: now,
      releasedBy: input.by,
      reviewerAckBy: needsReviewer ? reviewer : config.reviewerAckBy,
      reviewerAckAt: needsReviewer ? now : config.reviewerAckAt,
    })
    .where(eq(s.configurations.id, input.configId))
    .run();

  return { ok: true };
}
