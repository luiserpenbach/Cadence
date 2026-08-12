import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { availableQty } from "../../lib/domain/inventory";
import { AdjustLotForm, CreateLotForm } from "../../components/inventory-forms";

export const dynamic = "force-dynamic";

export default function InventoryPage() {
  ensureAppData();
  const db = getDb();
  const rows = db
    .select({
      id: s.inventoryLots.id,
      qty: s.inventoryLots.qtyOnHand,
      reserved: s.inventoryLots.qtyReserved,
      location: s.inventoryLots.location,
      lotCode: s.inventoryLots.lotCode,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
      name: s.parts.name,
      partRevisionId: s.inventoryLots.partRevisionId,
    })
    .from(s.inventoryLots)
    .innerJoin(
      s.partRevisions,
      eq(s.inventoryLots.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all()
    .sort((a, b) =>
      `${a.partNumber}@${a.revision}`.localeCompare(`${b.partNumber}@${b.revision}`),
    );

  const movements = db
    .select()
    .from(s.inventoryMovements)
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  const lotById = Object.fromEntries(rows.map((r) => [r.id, r]));

  const partRevs = db
    .select({
      id: s.partRevisions.id,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
    })
    .from(s.partRevisions)
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all()
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber));

  return (
    <AppShell
      title="Inventory"
      subtitle="Proto-cage stock that moves — receive, reserve, issue, and adjust lots."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <DataTable
            empty="No lots yet — create one or receive a PO."
            headers={["Part", "Rev", "On hand", "Reserved", "Avail", "Lot", "Location"]}
            rows={rows.map((r) => [
              <span key="p" className="font-mono text-xs">
                {r.partNumber}
              </span>,
              r.revision,
              String(r.qty),
              String(r.reserved),
              String(availableQty({ qtyOnHand: r.qty, qtyReserved: r.reserved })),
              <Link
                key="l"
                href={`/trace?q=${encodeURIComponent(r.lotCode)}`}
                className="font-mono text-xs underline"
              >
                {r.lotCode}
              </Link>,
              r.location,
            ])}
          />
        </Panel>
        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-xl">New lot</h2>
            <CreateLotForm
              partRevs={partRevs.map((p) => ({
                id: p.id,
                label: `${p.partNumber} @ ${p.revision}`,
              }))}
            />
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Adjust</h2>
            <AdjustLotForm
              lots={rows.map((r) => ({
                id: r.id,
                label: `${r.partNumber} @ ${r.revision} · ${r.lotCode}`,
              }))}
            />
          </Panel>
        </div>
      </div>

      <Panel className="mt-5">
        <h2 className="font-display text-xl">Recent movements</h2>
        <div className="mt-3">
          <DataTable
            compact
            empty="No movements yet."
            headers={["When", "Kind", "Qty", "Lot", "By", "Reason"]}
            rows={movements.map((m) => {
              const lot = lotById[m.lotId];
              return [
                <span key="t" className="text-xs text-[var(--muted)]">
                  {m.createdAt}
                </span>,
                <Badge key="k" tone="neutral">
                  {m.kind}
                </Badge>,
                String(m.qty),
                lot ? (
                  <Link
                    key="l"
                    className="font-mono text-xs underline"
                    href={`/trace?q=${encodeURIComponent(lot.lotCode)}`}
                  >
                    {lot.lotCode}
                  </Link>
                ) : (
                  m.lotId
                ),
                m.by,
                m.reason || "—",
              ];
            })}
          />
        </div>
      </Panel>
    </AppShell>
  );
}
