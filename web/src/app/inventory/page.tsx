import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { availableQty } from "../../lib/domain/inventory";
import { AdjustLotForm, CreateLotForm } from "../../components/inventory-forms";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  ensureAppData();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();
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

  const held = db
    .select({
      lotId: s.kitLines.lotId,
      kitKey: s.kits.key,
      kitId: s.kits.id,
      status: s.kits.status,
    })
    .from(s.kitLines)
    .innerJoin(s.kits, eq(s.kitLines.kitId, s.kits.id))
    .all()
    .filter((h) => h.lotId && h.status !== "cancelled" && h.status !== "issued");
  const heldByLot = new Map<string, typeof held>();
  for (const h of held) {
    if (!h.lotId) continue;
    const list = heldByLot.get(h.lotId) ?? [];
    list.push(h);
    heldByLot.set(h.lotId, list);
  }

  const filtered = q
    ? rows.filter((r) =>
        `${r.partNumber} ${r.revision} ${r.lotCode} ${r.location} ${r.name}`
          .toLowerCase()
          .includes(q),
      )
    : rows;

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
          <form method="get" className="mb-4 flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search part, lot, location…"
              className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)]"
            >
              Search
            </button>
          </form>
          <DataTable
            empty="No lots yet — create one or receive a PO."
            headers={["Part", "Rev", "On hand", "Reserved", "Avail", "Lot", "Held by", "Location"]}
            rows={filtered.map((r) => [
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
              <span key="h" className="text-xs">
                {(heldByLot.get(r.id) ?? []).map((h) => (
                  <Link key={h.kitId} className="mr-1 underline" href={`/kits/${h.kitId}`}>
                    {h.kitKey}
                  </Link>
                ))}
                {(heldByLot.get(r.id) ?? []).length === 0 ? "—" : null}
              </span>,
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
