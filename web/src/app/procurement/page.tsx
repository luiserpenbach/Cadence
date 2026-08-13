import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import {
  AddPoLineForm,
  CreatePoForm,
  PoStatusButtons,
} from "../../components/inventory-forms";

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
  const partRevOptions = partRevs.map((p) => ({
    id: p.id,
    label: `${p.partNumber} @ ${p.revision}`,
  }));

  return (
    <AppShell
      title="Procurement"
      subtitle="Demand signal and simple POs — receive into stock so inventory stays true."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {orders.length === 0 ? (
            <Panel>No purchase orders yet — create one to the right.</Panel>
          ) : (
            orders.map((po) => (
              <Panel key={po.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl">{po.poNumber}</h2>
                  <Badge
                    tone={
                      po.status === "received"
                        ? "ok"
                        : po.status === "ordered"
                          ? "accent"
                          : "warn"
                    }
                  >
                    {po.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {po.supplier}
                  {po.notes ? ` — ${po.notes}` : ""}
                  {po.receivedBy ? ` · received by ${po.receivedBy}` : ""}
                </p>
                <div className="mt-3">
                  <DataTable
                    compact
                    empty="No lines yet."
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
                {po.status !== "received" ? (
                  <AddPoLineForm poId={po.id} partRevs={partRevOptions} />
                ) : null}
                <PoStatusButtons poId={po.id} status={po.status} />
              </Panel>
            ))
          )}
        </div>
        <Panel>
          <h2 className="font-display text-xl">New PO</h2>
          <CreatePoForm />
        </Panel>
      </div>
    </AppShell>
  );
}
