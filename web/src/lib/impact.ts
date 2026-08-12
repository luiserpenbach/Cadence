import { eq } from "drizzle-orm";
import { getDb } from "../db";
import * as s from "../db/schema";
import { compareSerials } from "./serial";
import { configCoversArticle } from "./domain/effectivity";
import { inboundByRevision, stockByRevision } from "./domain/inventory";

export type BomPin = {
  partRevisionId: string;
  partNumber: string;
  revision: string;
  name: string;
  qty: number;
  findNumber: string;
  notes: string;
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
      notes: s.configBomLines.notes,
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
    notes: r.notes,
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

// Default delta for the dashboard and /change: the most recently released
// config that was cut from another, paired with its base.
export function getDefaultDelta(): {
  from: typeof s.configurations.$inferSelect;
  to: typeof s.configurations.$inferSelect;
} | null {
  const db = getDb();
  const configs = db.select().from(s.configurations).all();
  const byId = new Map(configs.map((c) => [c.id, c]));
  const to = configs
    .filter((c) => c.status === "released" && c.basedOnConfigId)
    .sort((a, b) => (a.releasedAt ?? "").localeCompare(b.releasedAt ?? ""))
    .at(-1);
  if (!to?.basedOnConfigId) return null;
  const from = byId.get(to.basedOnConfigId);
  if (!from) return null;
  return { from, to };
}

export type ShortageRow = {
  partRevisionId: string;
  partNumber: string;
  revision: string;
  needed: number;
  onHand: number;
  available: number;
  inbound: number;
  short: number;
};

export function shortagesForConfig(
  configId: string,
  kitCount: number,
): ShortageRow[] {
  const db = getDb();
  const bom = getConfigBom(configId);
  const stock = stockByRevision(db);
  const inbound = inboundByRevision(db);
  const rows: ShortageRow[] = [];
  for (const line of bom) {
    const summary = stock.get(line.partRevisionId);
    const onHand = summary?.onHand ?? 0;
    const available = summary?.available ?? 0;
    const inboundQty = inbound.get(line.partRevisionId) ?? 0;
    const needed = line.qty * kitCount;
    rows.push({
      partRevisionId: line.partRevisionId,
      partNumber: line.partNumber,
      revision: line.revision,
      needed,
      onHand,
      available,
      inbound: inboundQty,
      short: Math.max(0, needed - available - inboundQty),
    });
  }
  return rows;
}

export type ImpactReport = {
  from: typeof s.configurations.$inferSelect;
  to: typeof s.configurations.$inferSelect;
  bomDeltas: BomDelta[];
  testDiff: ReturnType<typeof diffRequiredTests>;
  inventoryShortages: ShortageRow[];
  kitCount: number;
  articlesOnPrior: Array<{ serial: string; name: string }>;
  staleTestHint: string;
};

export function buildImpactReport(
  fromConfigId: string,
  toConfigId: string,
): ImpactReport | null {
  const db = getDb();
  const from = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, fromConfigId))
    .get();
  const to = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, toConfigId))
    .get();
  if (!from || !to) return null;

  const bomDeltas = diffBom(fromConfigId, toConfigId);
  const testDiff = diffRequiredTests(fromConfigId, toConfigId);

  const articles = db.select().from(s.articles).all();
  const kitCount = Math.max(
    articles.filter((a) => configCoversArticle(db, toConfigId, a)).length,
    1,
  );
  const inventoryShortages = shortagesForConfig(toConfigId, kitCount).filter(
    (row) => row.short > 0,
  );

  const articlesOnPrior = articles
    .filter(
      (a) =>
        configCoversArticle(db, fromConfigId, a) &&
        !configCoversArticle(db, toConfigId, a),
    )
    .map((a) => ({ serial: a.serial, name: a.name }))
    .sort((a, b) => compareSerials(a.serial, b.serial));

  return {
    from,
    to,
    bomDeltas,
    testDiff,
    inventoryShortages,
    kitCount,
    articlesOnPrior,
    staleTestHint:
      "Tests shared between configs should be treated as stale for articles moving to the new config until re-run.",
  };
}
