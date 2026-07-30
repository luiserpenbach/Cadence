import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { getRunVerification } from "../queries";

export type AckInput = {
  runId: string;
  by: string;
  reason: string;
};

export type AckResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

// Records an explicit acknowledgment object covering exactly the gaps that
// are open and unacknowledged right now. Gaps that appear later are not
// covered and warn again — no silent green.
export function acknowledgeGaps(db: Db, input: AckInput): AckResult {
  const run = db.select().from(s.runs).where(eq(s.runs.id, input.runId)).get();
  if (!run) return { ok: false, error: "Run not found." };

  const report = getRunVerification(input.runId);
  const open = report.gaps.filter((g) => !g.acknowledged);
  if (open.length === 0) {
    return { ok: false, error: "No unacknowledged gaps on this run." };
  }

  db.transaction((tx) => {
    const ackId = id("ack");
    tx.insert(s.runGapAcks)
      .values({
        id: ackId,
        runId: input.runId,
        ackBy: input.by,
        reason: input.reason,
      })
      .run();
    for (const gap of open) {
      tx.insert(s.runGapAckLines)
        .values({
          id: id("ackl"),
          ackId,
          testDefinitionId: gap.testDefinitionId,
          status: gap.status,
        })
        .run();
    }
  });

  return { ok: true, count: open.length };
}
