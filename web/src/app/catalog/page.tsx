import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell, Panel, linkClass } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import {
  CutInRevisionForm,
  NewPartForm,
  NewRevisionForm,
} from "../../components/authoring-forms";
import { CatalogTable } from "../../components/catalog-table";
import { ImportCatalogForm } from "../../components/inventory-forms";
import { latestRevision } from "../../lib/catalog-format";
import { ensureCatalogSettings } from "../../lib/domain/catalog-settings";
import { stockByRevision } from "../../lib/domain/inventory";

export const dynamic = "force-dynamic";

function SettingsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3" />
    </svg>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  ensureAppData();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const db = getDb();
  const settings = ensureCatalogSettings(db);
  const parts = db.select().from(s.parts).all();
  const revs = db.select().from(s.partRevisions).all();
  const revsByPart = new Map<string, typeof revs>();
  for (const r of revs) {
    const list = revsByPart.get(r.partId) ?? [];
    list.push(r);
    revsByPart.set(r.partId, list);
  }
  const stock = stockByRevision(db);

  const catalogRows = parts
    .slice()
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
    .map((p) => {
      const partRevs = (revsByPart.get(p.id) ?? []).sort((a, b) =>
        a.revision.localeCompare(b.revision),
      );
      const onHand = partRevs.reduce(
        (sum, r) => sum + (stock.get(r.id)?.onHand ?? 0),
        0,
      );
      return {
        id: p.id,
        partNumber: p.partNumber,
        name: p.name,
        category: p.category,
        sourcing: p.sourcing,
        kind: p.kind,
        description: p.description,
        latestRev: latestRevision(partRevs.map((r) => r.revision)) ?? "",
        onHand,
      };
    });

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
      actions={
        <Link
          href="/catalog/settings"
          className={`${linkClass} inline-flex items-center gap-1.5`}
        >
          <SettingsIcon />
          Settings
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <CatalogTable parts={catalogRows} initialQuery={q} />
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display">New part</h2>
            <NewPartForm
              key={parts.length}
              categories={settings.categories}
              prefixes={settings.prefixes}
              partNumbers={parts.map((p) => p.partNumber)}
            />
          </Panel>
          <Panel>
            <h2 className="font-display">New revision</h2>
            <NewRevisionForm
              parts={parts
                .slice()
                .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
                .map((p) => ({ id: p.id, partNumber: p.partNumber }))}
            />
          </Panel>
          <Panel>
            <h2 className="font-display">Cut in a revision</h2>
            <CutInRevisionForm
              partRevs={partRevOptions.map((p) => ({
                id: p.id,
                label: `${p.partNumber} @ ${p.revision}`,
              }))}
            />
          </Panel>
          <Panel>
            <h2 className="font-display">Bulk import</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Header: part, name, rev, category, sourcing, kind, description
            </p>
            <ImportCatalogForm />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
