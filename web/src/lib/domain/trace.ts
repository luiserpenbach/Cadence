import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";

// Genealogy lookup (CONCEPT module map: serial ↔ config ↔ build ↔ test ↔
// supplier). One identifier in — an article serial, an installed part
// serial/lot, or an inventory lot code — full history out.

export type ArticleTrace = {
  kind: "article";
  article: typeof s.articles.$inferSelect;
  asBuilt: Array<{
    id: string;
    partNumber: string;
    revision: string;
    name: string;
    qty: number;
    serialOrLot: string;
    recordedAt: string;
    runKey: string | null;
    runId: string | null;
  }>;
  runs: Array<{
    id: string;
    key: string;
    status: string;
    standKey: string;
    articleConfigKey: string;
    articleConfigId: string;
    standConfigKey: string;
    standConfigId: string;
    passCount: number;
    gapCount: number;
    executionCount: number;
  }>;
};

export type ItemTrace = {
  kind: "item";
  identifier: string;
  installs: Array<{
    articleId: string;
    articleSerial: string;
    partNumber: string;
    revision: string;
    qty: number;
    recordedAt: string;
    runKey: string | null;
    runId: string | null;
  }>;
  lots: Array<{
    lotCode: string;
    partNumber: string;
    revision: string;
    qtyOnHand: number;
    location: string;
  }>;
  purchaseOrders: Array<{
    id: string;
    poNumber: string;
    supplier: string;
    status: string;
    partNumber: string;
    revision: string;
    qty: number;
  }>;
};

export type TraceResult = ArticleTrace | ItemTrace | { kind: "none" };

export function trace(db: Db, rawQuery: string): TraceResult {
  const query = rawQuery.trim();
  if (!query) return { kind: "none" };
  const q = query.toLowerCase();

  // 1) Article serial (unique) — the unit-level genealogy
  const article = db
    .select()
    .from(s.articles)
    .all()
    .find((a) => a.serial.toLowerCase() === q);
  if (article) return traceArticle(db, article);

  // 2) Installed serial/lot and/or inventory lot code — the item-level trail
  const installsRaw = db
    .select({
      articleId: s.asBuiltLines.articleId,
      serial: s.articles.serial,
      qty: s.asBuiltLines.qty,
      serialOrLot: s.asBuiltLines.serialOrLot,
      recordedAt: s.asBuiltLines.recordedAt,
      runId: s.asBuiltLines.runId,
      partRevisionId: s.asBuiltLines.partRevisionId,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
    })
    .from(s.asBuiltLines)
    .innerJoin(s.articles, eq(s.asBuiltLines.articleId, s.articles.id))
    .innerJoin(
      s.partRevisions,
      eq(s.asBuiltLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all()
    .filter((l) => l.serialOrLot.toLowerCase() === q);

  const lots = db
    .select({
      lotCode: s.inventoryLots.lotCode,
      qtyOnHand: s.inventoryLots.qtyOnHand,
      location: s.inventoryLots.location,
      partRevisionId: s.inventoryLots.partRevisionId,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
    })
    .from(s.inventoryLots)
    .innerJoin(
      s.partRevisions,
      eq(s.inventoryLots.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all()
    .filter((l) => l.lotCode.toLowerCase() === q);

  if (installsRaw.length === 0 && lots.length === 0) return { kind: "none" };

  const runIds = installsRaw
    .map((i) => i.runId)
    .filter((r): r is string => Boolean(r));
  const runRows =
    runIds.length > 0
      ? db.select().from(s.runs).where(inArray(s.runs.id, runIds)).all()
      : [];
  const runById = new Map(runRows.map((r) => [r.id, r]));

  // Supplier trail: POs carrying the part revisions this identifier touches
  const revIds = [
    ...new Set([
      ...installsRaw.map((i) => i.partRevisionId),
      ...lots.map((l) => l.partRevisionId),
    ]),
  ];
  const poLines =
    revIds.length > 0
      ? db
          .select({
            id: s.purchaseOrders.id,
            poNumber: s.purchaseOrders.poNumber,
            supplier: s.purchaseOrders.supplier,
            status: s.purchaseOrders.status,
            qty: s.purchaseOrderLines.qty,
            partNumber: s.parts.partNumber,
            revision: s.partRevisions.revision,
          })
          .from(s.purchaseOrderLines)
          .innerJoin(
            s.purchaseOrders,
            eq(s.purchaseOrderLines.purchaseOrderId, s.purchaseOrders.id),
          )
          .innerJoin(
            s.partRevisions,
            eq(s.purchaseOrderLines.partRevisionId, s.partRevisions.id),
          )
          .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
          .where(inArray(s.purchaseOrderLines.partRevisionId, revIds))
          .all()
      : [];

  return {
    kind: "item",
    identifier: query,
    installs: installsRaw.map((i) => ({
      articleId: i.articleId,
      articleSerial: i.serial,
      partNumber: i.partNumber,
      revision: i.revision,
      qty: i.qty,
      recordedAt: i.recordedAt,
      runKey: i.runId ? (runById.get(i.runId)?.key ?? null) : null,
      runId: i.runId,
    })),
    lots,
    purchaseOrders: poLines,
  };
}

function traceArticle(
  db: Db,
  article: typeof s.articles.$inferSelect,
): ArticleTrace {
  const asBuilt = db
    .select({
      id: s.asBuiltLines.id,
      qty: s.asBuiltLines.qty,
      serialOrLot: s.asBuiltLines.serialOrLot,
      recordedAt: s.asBuiltLines.recordedAt,
      runId: s.asBuiltLines.runId,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
      name: s.parts.name,
    })
    .from(s.asBuiltLines)
    .innerJoin(
      s.partRevisions,
      eq(s.asBuiltLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(eq(s.asBuiltLines.articleId, article.id))
    .orderBy(asc(s.asBuiltLines.recordedAt))
    .all();

  const runRows = db
    .select()
    .from(s.runs)
    .where(eq(s.runs.articleId, article.id))
    .orderBy(asc(s.runs.createdAt))
    .all();
  const runById = new Map(runRows.map((r) => [r.id, r]));

  const configIds = [
    ...new Set(runRows.flatMap((r) => [r.articleConfigId, r.standConfigId])),
  ];
  const configs =
    configIds.length > 0
      ? db
          .select()
          .from(s.configurations)
          .where(inArray(s.configurations.id, configIds))
          .all()
      : [];
  const configById = new Map(configs.map((c) => [c.id, c]));

  const stands = db.select().from(s.stands).all();
  const standById = new Map(stands.map((st) => [st.id, st]));

  const runs = runRows.map((r) => {
    const results = db
      .select()
      .from(s.testResults)
      .where(eq(s.testResults.runId, r.id))
      .all();
    const executions = db
      .select({ c: sql<number>`count(*)` })
      .from(s.procedureExecutions)
      .where(eq(s.procedureExecutions.runId, r.id))
      .get();
    return {
      id: r.id,
      key: r.key,
      status: r.status,
      standKey: standById.get(r.standId)?.key ?? "—",
      articleConfigKey: configById.get(r.articleConfigId)?.key ?? "—",
      articleConfigId: r.articleConfigId,
      standConfigKey: configById.get(r.standConfigId)?.key ?? "—",
      standConfigId: r.standConfigId,
      passCount: results.filter((x) => x.status === "pass").length,
      gapCount: results.filter((x) => x.status !== "pass").length,
      executionCount: executions?.c ?? 0,
    };
  });

  return {
    kind: "article",
    article,
    asBuilt: asBuilt.map((l) => ({
      ...l,
      runKey: l.runId ? (runById.get(l.runId)?.key ?? null) : null,
    })),
    runs,
  };
}
