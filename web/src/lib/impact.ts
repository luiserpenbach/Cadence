import { eq } from "drizzle-orm";
import { getDb } from "../db";
import * as s from "../db/schema";

export type BomPin = {
  partRevisionId: string;
  partNumber: string;
  revision: string;
  name: string;
  qty: number;
  findNumber: string;
};

export type BomDelta =
  | {
      type: "added" | "removed";
      partNumber: string;
      revision: string;
      name: string;
      qty: number;
      findNumber: string;
    }
  | {
      type: "changed";
      findNumber: string;
      partNumber: string;
      name: string;
      fromRevision: string;
      toRevision: string;
      fromQty: number;
      toQty: number;
    };

export function getConfigBom(configId: string): BomPin[] {
  const db = getDb();
  const rows = db
    .select({
      partRevisionId: s.configBomLines.partRevisionId,
      qty: s.configBomLines.qty,
      findNumber: s.configBomLines.findNumber,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
      name: s.parts.name,
    })
    .from(s.configBomLines)
    .innerJoin(
      s.partRevisions,
      eq(s.configBomLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(eq(s.configBomLines.configId, configId))
    .all();

  return rows.map((r) => ({
    partRevisionId: r.partRevisionId,
    partNumber: r.partNumber,
    revision: r.revision,
    name: r.name,
    qty: r.qty,
    findNumber: r.findNumber,
  }));
}

export function diffBom(fromId: string, toId: string): BomDelta[] {
  const from = getConfigBom(fromId);
  const to = getConfigBom(toId);
  const deltas: BomDelta[] = [];

  const fromByFind = new Map(from.map((l) => [l.findNumber || l.partNumber, l]));
  const toByFind = new Map(to.map((l) => [l.findNumber || l.partNumber, l]));

  for (const [key, line] of toByFind) {
    const prev = fromByFind.get(key);
    if (!prev) {
      deltas.push({
        type: "added",
        partNumber: line.partNumber,
        revision: line.revision,
        name: line.name,
        qty: line.qty,
        findNumber: line.findNumber,
      });
    } else if (
      prev.partRevisionId !== line.partRevisionId ||
      prev.qty !== line.qty
    ) {
      deltas.push({
        type: "changed",
        findNumber: line.findNumber,
        partNumber: line.partNumber,
        name: line.name,
        fromRevision: prev.revision,
        toRevision: line.revision,
        fromQty: prev.qty,
        toQty: line.qty,
      });
    }
  }

  for (const [key, line] of fromByFind) {
    if (!toByFind.has(key)) {
      deltas.push({
        type: "removed",
        partNumber: line.partNumber,
        revision: line.revision,
        name: line.name,
        qty: line.qty,
        findNumber: line.findNumber,
      });
    }
  }

  return deltas;
}

export function getRequiredTestIds(configId: string): string[] {
  const db = getDb();
  return db
    .select({ id: s.configRequiredTests.testDefinitionId })
    .from(s.configRequiredTests)
    .where(eq(s.configRequiredTests.configId, configId))
    .all()
    .map((r) => r.id);
}

export function diffRequiredTests(fromId: string, toId: string) {
  const db = getDb();
  const from = new Set(getRequiredTestIds(fromId));
  const to = new Set(getRequiredTestIds(toId));
  const allIds = new Set([...from, ...to]);
  const defs = db.select().from(s.testDefinitions).all();
  const byId = Object.fromEntries(defs.map((d) => [d.id, d]));

  const added = [...to].filter((id) => !from.has(id)).map((id) => byId[id]);
  const removed = [...from].filter((id) => !to.has(id)).map((id) => byId[id]);
  const shared = [...allIds].filter((id) => from.has(id) && to.has(id));

  return { added, removed, shared: shared.map((id) => byId[id]) };
}

export type ImpactReport = {
  from: typeof s.configurations.$inferSelect;
  to: typeof s.configurations.$inferSelect;
  bomDeltas: BomDelta[];
  testDiff: ReturnType<typeof diffRequiredTests>;
  inventoryShortages: Array<{
    partNumber: string;
    revision: string;
    needed: number;
    onHand: number;
  }>;
  articlesOnPrior: Array<{ serial: string; name: string }>;
  staleTestHint: string;
};

export function buildImpactReport(fromConfigId: string, toConfigId: string): ImpactReport {
  const db = getDb();
  const from = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, fromConfigId))
    .get()!;
  const to = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, toConfigId))
    .get()!;

  const bomDeltas = diffBom(fromConfigId, toConfigId);
  const testDiff = diffRequiredTests(fromConfigId, toConfigId);

  const toBom = getConfigBom(toConfigId);
  const inventoryShortages = [];
  for (const line of toBom) {
    const lots = db
      .select()
      .from(s.inventoryLots)
      .where(eq(s.inventoryLots.partRevisionId, line.partRevisionId))
      .all();
    const onHand = lots.reduce((sum, l) => sum + l.qtyOnHand, 0);
    if (onHand < line.qty) {
      inventoryShortages.push({
        partNumber: line.partNumber,
        revision: line.revision,
        needed: line.qty,
        onHand,
      });
    }
  }

  // Articles that have as-built against prior config pins (approx: all articles with as-built)
  const articlesOnPrior = db
    .select({
      serial: s.articles.serial,
      name: s.articles.name,
    })
    .from(s.articles)
    .all()
    .filter((a) => {
      // simplistic: articles below serialFrom of `to` are on prior
      const eff = db
        .select()
        .from(s.configEffectivity)
        .where(eq(s.configEffectivity.configId, toConfigId))
        .get();
      if (!eff?.serialFrom) return false;
      return a.serial < eff.serialFrom;
    });

  return {
    from,
    to,
    bomDeltas,
    testDiff,
    inventoryShortages,
    articlesOnPrior,
    staleTestHint:
      "Tests shared between configs should be treated as stale for articles moving to the new config until re-run.",
  };
}
