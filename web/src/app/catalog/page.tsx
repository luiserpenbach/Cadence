import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";

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

  return (
    <AppShell
      title="Catalog"
      subtitle="Parts and revisions. Rev only when the artifact changes — configs absorb system recipe churn."
    >
      <Panel>
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
    </AppShell>
  );
}
