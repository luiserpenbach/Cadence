import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel, buttonClass, inputClass } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import {
  CutInRevisionForm,
  NewPartForm,
  NewRevisionForm,
} from "../../components/authoring-forms";
import { ImportCatalogForm } from "../../components/inventory-forms";
import { stockByRevision } from "../../lib/domain/inventory";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  ensureAppData();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();
  const db = getDb();
  const parts = db.select().from(s.parts).all();
  const revs = db.select().from(s.partRevisions).all();
  const revsByPart = new Map<string, typeof revs>();
  for (const r of revs) {
    const list = revsByPart.get(r.partId) ?? [];
    list.push(r);
    revsByPart.set(r.partId, list);
  }
  const stock = stockByRevision(db);

  const filtered = parts
    .filter((p) => {
      if (!q) return true;
      const hay = `${p.partNumber} ${p.name} ${p.category} ${p.sourcing} ${p.kind} ${p.description}`.toLowerCase();
      return hay.includes(q);
    })
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
    <AppShell title="Catalog">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <form method="get" className="mb-4 flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search part number, name, category…"
              className={inputClass}
            />
            <button
              type="submit"
              className={buttonClass}
            >
              Search
            </button>
          </form>
          <DataTable
            empty="No parts match — create one to the right."
            headers={["Part", "Name", "Revs", "Type", "Sourcing", "On hand"]}
            rows={filtered.map((p) => {
              const partRevs = (revsByPart.get(p.id) ?? []).sort((a, b) =>
                a.revision.localeCompare(b.revision),
              );
              const onHand = partRevs.reduce(
                (sum, r) => sum + (stock.get(r.id)?.onHand ?? 0),
                0,
              );
              return [
                <Link
                  key="pn"
                  href={`/catalog/${p.id}`}
                  className="font-mono text-xs underline-offset-2 hover:underline"
                >
                  {p.partNumber}
                </Link>,
                p.name,
                <span key="r" className="flex flex-wrap gap-1">
                  {partRevs.map((r) => (
                    <Badge key={r.id} tone="accent">
                      {r.revision}
                    </Badge>
                  ))}
                </span>,
                <span key="t" className="text-xs">
                  {p.category}
                  {p.kind === "assembly" ? (
                    <Badge tone="warn"> assembly</Badge>
                  ) : null}
                </span>,
                <Badge key="src" tone={p.sourcing === "make" ? "accent" : "neutral"}>
                  {p.sourcing}
                </Badge>,
                String(onHand),
              ];
            })}
          />
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display">New part</h2>
            <NewPartForm />
          </Panel>
          <Panel>
            <h2 className="font-display">Bulk import</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Header: part, name, rev, category, sourcing, kind, description
            </p>
            <ImportCatalogForm />
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
        </div>
      </div>
    </AppShell>
  );
}
