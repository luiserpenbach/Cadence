import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { availableQty } from "../../../lib/domain/inventory";
import {
  AllocateKitLineForm,
  KitLifecycleButtons,
} from "../../../components/inventory-forms";

export const dynamic = "force-dynamic";

export default async function KitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureAppData();
  const { id } = await params;
  const db = getDb();
  const kit = db.select().from(s.kits).where(eq(s.kits.id, id)).get();
  if (!kit) notFound();

  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, kit.articleId))
    .get();
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, kit.configId))
    .get();

  const lines = db
    .select({
      id: s.kitLines.id,
      qty: s.kitLines.qty,
      findNumber: s.kitLines.findNumber,
      lotId: s.kitLines.lotId,
      partRevisionId: s.kitLines.partRevisionId,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
      name: s.parts.name,
    })
    .from(s.kitLines)
    .innerJoin(s.partRevisions, eq(s.kitLines.partRevisionId, s.partRevisions.id))
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(eq(s.kitLines.kitId, kit.id))
    .all();

  const lots = db
    .select({
      id: s.inventoryLots.id,
      lotCode: s.inventoryLots.lotCode,
      qtyOnHand: s.inventoryLots.qtyOnHand,
      qtyReserved: s.inventoryLots.qtyReserved,
      partRevisionId: s.inventoryLots.partRevisionId,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
    })
    .from(s.inventoryLots)
    .innerJoin(s.partRevisions, eq(s.inventoryLots.partRevisionId, s.partRevisions.id))
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all();

  const bomLines = db
    .select()
    .from(s.configBomLines)
    .where(eq(s.configBomLines.configId, kit.configId))
    .all();
  const alts = db.select().from(s.configBomAlternates).all();
  const allowedByPin = new Map<string, Set<string>>();
  for (const pin of bomLines) {
    const set = new Set<string>([pin.partRevisionId]);
    for (const a of alts.filter((x) => x.bomLineId === pin.id)) {
      set.add(a.partRevisionId);
    }
    allowedByPin.set(pin.partRevisionId, set);
  }

  const allocatedLot = Object.fromEntries(
    lots.map((l) => [l.id, l]),
  );

  return (
    <AppShell title={kit.key} subtitle={`${article?.serial} · ${config?.key}`}>
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge
          tone={
            kit.status === "issued"
              ? "ok"
              : kit.status === "cancelled"
                ? "neutral"
                : "warn"
          }
        >
          {kit.status}
        </Badge>
        <Link className="text-sm underline" href={`/articles/${kit.articleId}`}>
          {article?.serial}
        </Link>
        <Link className="text-sm underline" href={`/configs/${kit.configId}`}>
          {config?.key}
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">Lines</h2>
          <div className="mt-3">
            <DataTable
              headers={["Find", "Part", "Rev", "Qty", "Lot", "Allocate"]}
              rows={lines.map((l) => {
                const allowed = allowedByPin.get(l.partRevisionId) ?? new Set([l.partRevisionId]);
                const matching = lots.filter(
                  (lot) =>
                    allowed.has(lot.partRevisionId) &&
                    availableQty(lot) >= l.qty,
                );
                const current = l.lotId ? allocatedLot[l.lotId] : null;
                return [
                  <span key="f" className="font-mono text-xs">
                    {l.findNumber || "—"}
                  </span>,
                  <span key="p" className="font-mono text-xs">
                    {l.partNumber}
                  </span>,
                  l.revision,
                  String(l.qty),
                  current ? (
                    <Link
                      key="lot"
                      className="font-mono text-xs underline"
                      href={`/trace?q=${encodeURIComponent(current.lotCode)}`}
                    >
                      {current.lotCode}
                    </Link>
                  ) : (
                    "—"
                  ),
                  kit.status === "issued" || kit.status === "cancelled" ? (
                    "—"
                  ) : (
                    <AllocateKitLineForm
                      key="a"
                      kitId={kit.id}
                      kitLineId={l.id}
                      lots={matching.map((lot) => ({
                        id: lot.id,
                        label: `${lot.lotCode} · ${lot.partNumber}@${lot.revision} (${availableQty(lot)} avail)`,
                      }))}
                    />
                  ),
                ];
              })}
            />
          </div>
        </Panel>
        <Panel>
          <h2 className="font-display text-xl">Issue</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Allocate every line, then issue. Cadence reserves on allocate and
            consumes + stamps as-built on issue.
          </p>
          <div className="mt-3">
            <KitLifecycleButtons
              kitId={kit.id}
              articleId={kit.articleId}
              status={kit.status}
            />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
