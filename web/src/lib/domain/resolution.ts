import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db";
import * as s from "../../db/schema";
import type { ConfigKind } from "../../db/schema";
import {
  configRank,
  type ExecutionContext,
  type SpecificityRank,
} from "./effectivity";

type Configuration = typeof s.configurations.$inferSelect;

// CONCEPT §4 resolution rule over released (non-superseded) configs:
// most specific wins; equal-specificity overlap is a conflict the designer
// must resolve; no covering config blocks run creation (distinct from
// missing tests).
export type Resolution =
  | { outcome: "resolved"; config: Configuration; rank: SpecificityRank }
  | { outcome: "conflict"; rank: SpecificityRank; candidates: Configuration[] }
  | { outcome: "none" };

export function resolveConfig(
  db: DbOrTx,
  kind: ConfigKind,
  ctx: ExecutionContext,
): Resolution {
  const released = db
    .select()
    .from(s.configurations)
    .where(
      and(
        eq(s.configurations.kind, kind),
        eq(s.configurations.status, "released"),
      ),
    )
    .all();

  let bestRank: SpecificityRank | null = null;
  let candidates: Configuration[] = [];
  for (const config of released) {
    const rank = configRank(db, config.id, ctx);
    if (rank === null) continue;
    if (bestRank === null || rank > bestRank) {
      bestRank = rank;
      candidates = [config];
    } else if (rank === bestRank) {
      candidates.push(config);
    }
  }

  if (bestRank === null) return { outcome: "none" };
  if (candidates.length > 1) {
    return { outcome: "conflict", rank: bestRank, candidates };
  }
  return { outcome: "resolved", config: candidates[0], rank: bestRank };
}
