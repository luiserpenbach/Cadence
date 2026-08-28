import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell, Panel } from "../../components/ui";
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
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.76 6.76 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.93 6.93 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
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
          aria-label="Catalog settings"
          className="inline-flex items-center justify-center p-1 text-[var(--ink)] hover:opacity-70"
        >
          <SettingsIcon />
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
