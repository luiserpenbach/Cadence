import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { diffAsBuilt } from "../../../lib/domain/asbuilt";
import { getConfigBom } from "../../../lib/impact";
import { AsBuiltForm } from "../../../components/authoring-forms";
import { ReverseAsBuiltButton } from "../../../components/inventory-forms";
import { QrLabel } from "../../../components/qr";

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureAppData();
  const { id } = await params;
  const db = getDb();
  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, id))
    .get();
  if (!article) notFound();

  const asBuilt = db
    .select({
      id: s.asBuiltLines.id,
      qty: s.asBuiltLines.qty,
      serialOrLot: s.asBuiltLines.serialOrLot,
      recordedAt: s.asBuiltLines.recordedAt,
      runId: s.asBuiltLines.runId,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
      name: s.parts.name,
    })
    .from(s.asBuiltLines)
    .innerJoin(
      s.partRevisions,
      eq(s.asBuiltLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(eq(s.asBuiltLines.articleId, article.id))
    .all();

  const runs = db
    .select()
    .from(s.runs)
    .where(eq(s.runs.articleId, article.id))
    .orderBy(desc(s.runs.createdAt))
    .all();
  const runById = Object.fromEntries(runs.map((r) => [r.id, r]));

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

  const delta = diffAsBuilt(db, article.id);
  const designedPins = delta?.configId ? getConfigBom(delta.configId) : [];
  const pinRevIds = new Set(designedPins.map((p) => p.partRevisionId));
  const asBuiltOptions = [
    ...designedPins.map((p) => ({
      id: p.partRevisionId,
      label: `pin ${p.findNumber} · ${p.partNumber} @ ${p.revision}`,
    })),
    ...partRevs
      .filter((p) => !pinRevIds.has(p.id))
      .map((p) => ({
        id: p.id,
        label: `${p.partNumber} @ ${p.revision}`,
      })),
  ];

  return (
    <AppShell title={article.serial} subtitle={article.name}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{article.status}</Badge>
          {delta ? (
            delta.lines.length === 0 ? (
              <Badge tone="ok">matches {delta.configKey}</Badge>
            ) : (
              <Badge tone="warn">
                {delta.lines.length} deltas vs {delta.configKey}
              </Badge>
            )
          ) : (
            <Badge tone="neutral">no covering config</Badge>
          )}
          <Link
            className="text-sm underline"
            href={`/trace?q=${encodeURIComponent(article.serial)}`}
          >
            Full genealogy
          </Link>
        </div>
        <QrLabel identifier={article.serial} size={96} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display">As-built</h2>
          <div className="mt-3">
            <DataTable
              headers={["Part", "Rev", "Qty", "Serial/Lot", "Run", ""]}
              rows={asBuilt.map((l) => [
                <span key="p" className="font-mono text-xs">
                  {l.partNumber}
                </span>,
                l.revision,
                String(l.qty),
                l.serialOrLot ? (
                  <Link
                    key="sl"
                    className="font-mono text-xs underline"
                    href={`/trace?q=${encodeURIComponent(l.serialOrLot)}`}
                  >
                    {l.serialOrLot}
                  </Link>
                ) : (
                  "—"
                ),
                l.runId ? (
                  <Link
                    key="r"
                    className="font-mono text-xs underline"
                    href={`/runs/${l.runId}`}
                  >
                    {runById[l.runId]?.key ?? l.runId}
                  </Link>
                ) : (
                  "—"
                ),
                <ReverseAsBuiltButton
                  key="rev"
                  asBuiltId={l.id}
                  articleId={article.id}
                />,
              ])}
            />
          </div>

          <h2 className="mt-6 font-display">
            As-designed vs as-built
          </h2>
          {!delta ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              No covering config and no as-built yet.
            </p>
          ) : delta.lines.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              As-built matches the {delta.configKey} BoM.
            </p>
          ) : (
            <div className="mt-3">
              <DataTable
                headers={["Delta", "Part", "Rev", "Designed", "Built"]}
                rows={delta.lines.map((l) => [
                  <Badge
                    key="k"
                    tone={l.kind === "extra" ? "accent" : "warn"}
                  >
                    {l.kind.replace("_", " ")}
                  </Badge>,
                  <span key="p" className="font-mono text-xs">
                    {l.partNumber}
                  </span>,
                  l.revision,
                  String(l.designedQty),
                  String(l.builtQty),
                ])}
              />
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display">Record as-built</h2>
            <AsBuiltForm
              articleId={article.id}
              partRevs={asBuiltOptions}
              runs={runs.map((r) => ({ id: r.id, key: r.key }))}
            />
          </Panel>

          <Panel>
            <h2 className="font-display">Runs</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <Link className="font-mono text-xs underline" href={`/runs/${r.id}`}>
                    {r.key}
                  </Link>
                  <Badge tone="neutral">{r.status}</Badge>
                </li>
              ))}
              {runs.length === 0 ? (
                <li className="text-sm text-[var(--muted)]">No runs yet.</li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
