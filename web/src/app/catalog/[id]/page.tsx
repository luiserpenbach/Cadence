import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { AttachmentsPanel } from "../../../components/attachments-panel";
import { NewRevisionForm } from "../../../components/authoring-forms";
import { EditPartForm } from "../../../components/inventory-forms";
import { stockByRevision } from "../../../lib/domain/inventory";
import { ensureCatalogSettings } from "../../../lib/domain/catalog-settings";

export const dynamic = "force-dynamic";

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureAppData();
  const { id } = await params;
  const db = getDb();
  const part = db.select().from(s.parts).where(eq(s.parts.id, id)).get();
  if (!part) notFound();

  const revisions = db
    .select()
    .from(s.partRevisions)
    .where(eq(s.partRevisions.partId, part.id))
    .all();

  // Where used: configs pinning any revision of this part
  const revIds = revisions.map((r) => r.id);
  const usage =
    revIds.length > 0
      ? db
          .select({
            configId: s.configurations.id,
            configKey: s.configurations.key,
            status: s.configurations.status,
            revision: s.partRevisions.revision,
            qty: s.configBomLines.qty,
          })
          .from(s.configBomLines)
          .innerJoin(
            s.configurations,
            eq(s.configBomLines.configId, s.configurations.id),
          )
          .innerJoin(
            s.partRevisions,
            eq(s.configBomLines.partRevisionId, s.partRevisions.id),
          )
          .where(inArray(s.configBomLines.partRevisionId, revIds))
          .all()
      : [];

  const stock = stockByRevision(db);
  const settings = ensureCatalogSettings(db);

  return (
    <AppShell title={part.partNumber} subtitle={part.name}>
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="neutral">{part.category}</Badge>
        <Badge tone={part.sourcing === "make" ? "accent" : "neutral"}>
          {part.sourcing}
        </Badge>
        <Badge tone={part.kind === "assembly" ? "warn" : "neutral"}>
          {part.kind}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display">Revisions</h2>
          <div className="mt-3">
            <DataTable
              headers={["Rev", "Status", "Notes", "On hand", "Created"]}
              rows={revisions.map((r) => [
                <Badge key="r" tone="accent">
                  {r.revision}
                </Badge>,
                r.status,
                r.notes || "—",
                <span key="oh">
                  {stock.get(r.id)?.onHand ?? 0}
                  {stock.get(r.id)?.reserved
                    ? ` (${stock.get(r.id)?.reserved} reserved)`
                    : ""}
                </span>,
                <span key="c" className="text-xs text-[var(--muted)]">
                  {r.createdAt}
                </span>,
              ])}
            />
          </div>

          <h2 className="mt-6 font-display">Where used</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {usage.map((u, idx) => (
              <li key={idx} className="flex flex-wrap items-center gap-2">
                <Link
                  className="font-mono text-xs underline"
                  href={`/configs/${u.configId}`}
                >
                  {u.configKey}
                </Link>
                <Badge
                  tone={
                    u.status === "released"
                      ? "ok"
                      : u.status === "superseded"
                        ? "neutral"
                        : "warn"
                  }
                >
                  {u.status}
                </Badge>
                <span className="text-xs text-[var(--muted)]">
                  rev {u.revision} × {u.qty}
                </span>
              </li>
            ))}
            {usage.length === 0 ? (
              <li className="text-[var(--muted)]">Not used in any config.</li>
            ) : null}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display">Edit part</h2>
            <EditPartForm part={part} categories={settings.categories} />
          </Panel>

          <Panel>
            <h2 className="font-display">Attachments</h2>
            <div className="mt-2">
              <AttachmentsPanel entityType="part" entityId={part.id} />
            </div>
          </Panel>

          <Panel>
            <h2 className="font-display">New revision</h2>
            <NewRevisionForm
              parts={[{ id: part.id, partNumber: part.partNumber }]}
            />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
