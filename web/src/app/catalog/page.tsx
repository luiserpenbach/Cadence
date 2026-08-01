import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import {
  CutInRevisionForm,
  NewPartForm,
  NewRevisionForm,
} from "../../components/authoring-forms";

export const dynamic = "force-dynamic";

export default function CatalogPage() {
  ensureAppData();
  const db = getDb();
  const rows = db
    .select({
      partNumber: s.parts.partNumber,
      name: s.parts.name,
      category: s.parts.category,
      revision: s.partRevisions.revision,
      notes: s.partRevisions.notes,
      status: s.partRevisions.status,
    })
    .from(s.partRevisions)
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all()
    .sort((a, b) =>
      `${a.partNumber}@${a.revision}`.localeCompare(
        `${b.partNumber}@${b.revision}`,
      ),
    );
  const parts = db
    .select({ id: s.parts.id, partNumber: s.parts.partNumber })
    .from(s.parts)
    .all()
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber));
  const partRevOptions = db
    .select({
      id: s.partRevisions.id,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
    })
    .from(s.partRevisions)
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .all()
    .sort((a, b) =>
      `${a.partNumber}@${a.revision}`.localeCompare(`${b.partNumber}@${b.revision}`),
    );

  return (
    <AppShell
      title="Catalog"
      subtitle="Parts and revisions. Rev only when the artifact changes — configs absorb system recipe churn."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <DataTable
            headers={["Part", "Rev", "Name", "Category", "Status", "Notes"]}
            rows={rows.map((r) => [
              <span key="pn" className="font-mono text-xs">
                {r.partNumber}
              </span>,
              <Badge key="rev" tone="accent">
                {r.revision}
              </Badge>,
              r.name,
              r.category,
              r.status,
              <span key="n" className="text-[var(--muted)]">
                {r.notes || "—"}
              </span>,
            ])}
          />
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-xl">New part</h2>
            <NewPartForm />
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">New revision</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Only when the artifact changes (drawing, material, interface).
            </p>
            <NewRevisionForm parts={parts} />
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Cut in a revision</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              One shot: drafts every released config pinning an older rev of
              this part, with the pin swapped. Review effectivity, then
              release.
            </p>
            <CutInRevisionForm
              partRevs={partRevOptions.map((p) => ({
                id: p.id,
                label: `${p.partNumber} @ ${p.revision}`,
              }))}
            />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
