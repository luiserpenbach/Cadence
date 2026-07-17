import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";

export const dynamic = "force-dynamic";

export default function ProcurementPage() {
  ensureAppData();
  const db = getDb();
  const orders = db.select().from(s.purchaseOrders).all();

  const lines = db
    .select({
      poId: s.purchaseOrderLines.purchaseOrderId,
      qty: s.purchaseOrderLines.qty,
      unitCost: s.purchaseOrderLines.unitCost,
      revision: s.partRevisions.revision,
      partNumber: s.parts.partNumber,
      name: s.parts.name,
    })
    .from(s.purchaseOrderLines)
    .innerJoin(
      s.partRevisions,
      eq(s.purchaseOrderLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all();

  return (
    <AppShell
      title="Procurement"
      subtitle="Thin purchasing — demand signal and simple POs so inventory isn’t fake."
    >
      {orders.map((po) => (
        <Panel key={po.id} className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">{po.poNumber}</h2>
            <Badge tone="accent">{po.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {po.supplier} — {po.notes}
          </p>
          <div className="mt-3">
            <DataTable
              headers={["Part", "Rev", "Qty", "Unit cost", "Name"]}
              rows={lines
                .filter((l) => l.poId === po.id)
                .map((l) => [
                  <span key="p" className="font-mono text-xs">
                    {l.partNumber}
                  </span>,
                  l.revision,
                  String(l.qty),
                  `$${l.unitCost}`,
                  l.name,
                ])}
            />
          </div>
        </Panel>
      ))}
    </AppShell>
  );
}
