import { eq } from "drizzle-orm";
import { AppShell, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";

export const dynamic = "force-dynamic";

export default function InventoryPage() {
  ensureAppData();
  const db = getDb();
  const rows = db
    .select({
      qty: s.inventoryLots.qtyOnHand,
      location: s.inventoryLots.location,
      lotCode: s.inventoryLots.lotCode,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
      name: s.parts.name,
    })
    .from(s.inventoryLots)
    .innerJoin(
      s.partRevisions,
      eq(s.inventoryLots.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all();

  return (
    <AppShell
      title="Inventory"
      subtitle="Thin proto-cage stock — enough to kit builds and surface shortages on config cut-in."
    >
      <Panel>
        <DataTable
          headers={["Part", "Rev", "On hand", "Lot", "Location", "Name"]}
          rows={rows.map((r) => [
            <span key="p" className="font-mono text-xs">
              {r.partNumber}
            </span>,
            r.revision,
            String(r.qty),
            <span key="l" className="font-mono text-xs">
              {r.lotCode}
            </span>,
            r.location,
            r.name,
          ])}
        />
      </Panel>
    </AppShell>
  );
}
