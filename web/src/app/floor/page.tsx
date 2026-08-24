import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { diffAsBuilt } from "../../lib/domain/asbuilt";
import { getFloorView } from "../../lib/domain/floor";
import { diffBom, shortagesForConfig } from "../../lib/impact";
import { getConfigBundle } from "../../lib/queries";
import { stockByRevision } from "../../lib/domain/inventory";
import { findActiveKit } from "../../lib/domain/kits";
import {
  CreateKitForm,
  KitLifecycleButtons,
  ReverseAsBuiltButton,
  ShortagePoForm,
  ShortageWoForm,
} from "../../components/inventory-forms";
import { FloorPicker } from "../../components/pickers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FloorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  ensureAppData();
  const params = await searchParams;
  const db = getDb();
  const articles = db.select().from(s.articles).all();
  const stands = db.select().from(s.stands).all();

  const articleId =
    typeof params.article === "string" ? params.article : articles[0]?.id;
  const standId =
    typeof params.stand === "string" ? params.stand : stands[0]?.id;

  const view =
    articleId && standId ? getFloorView(db, articleId, standId) : null;

  const picker = (
    <Panel>
      <FloorPicker
        articles={articles.map((a) => ({
          id: a.id,
          serial: a.serial,
          name: a.name,
        }))}
        stands={stands.map((st) => ({ id: st.id, key: st.key }))}
        articleId={articleId}
        standId={standId}
      />
    </Panel>
  );

  if (!view) {
    return (
      <AppShell title="Floor">
        {articles.length === 0 ? (
          <Panel>No articles yet.</Panel>
        ) : (
          picker
        )}
      </AppShell>
    );
  }

  const { articleResolution, standResolution } = view;

  const resolvedArticleConfig =
    articleResolution.outcome === "resolved" ? articleResolution.config : null;
  const resolvedStandConfig =
    standResolution.outcome === "resolved" ? standResolution.config : null;

  const articleBundle = resolvedArticleConfig
    ? getConfigBundle(resolvedArticleConfig.id)
    : null;
  const standBundle = resolvedStandConfig
    ? getConfigBundle(resolvedStandConfig.id)
    : null;
  const stock = stockByRevision(db);
  const activeKit = resolvedArticleConfig
    ? findActiveKit(db, view.article.id, resolvedArticleConfig.id)
    : undefined;
  const asBuiltDelta = diffAsBuilt(db, view.article.id);
  const asBuilt = db
    .select({
      id: s.asBuiltLines.id,
      qty: s.asBuiltLines.qty,
      serialOrLot: s.asBuiltLines.serialOrLot,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
    })
    .from(s.asBuiltLines)
    .innerJoin(
      s.partRevisions,
      eq(s.asBuiltLines.partRevisionId, s.partRevisions.id),
    )
    .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .where(eq(s.asBuiltLines.articleId, view.article.id))
    .all();
  const floorShorts = resolvedArticleConfig
    ? shortagesForConfig(resolvedArticleConfig.id, 1).filter((row) => row.short > 0)
    : [];

  const changeDelta =
    view.changedSinceLastRun && resolvedArticleConfig && view.lastRun
      ? diffBom(view.lastRun.articleConfigId, resolvedArticleConfig.id)
      : null;

  const resolutionProblem = (
    kind: string,
    r: typeof articleResolution,
  ): React.ReactNode => {
    if (r.outcome === "none") {
      return (
        <p className="alert alert-warn">
          No released {kind} config covers this.
        </p>
      );
    }
    if (r.outcome === "conflict") {
      return (
        <p className="alert alert-danger">
          Config conflict: {r.candidates.map((c) => c.key).join(" vs ")}.
          Fix effectivity before running.
        </p>
      );
    }
    return null;
  };

  return (
    <AppShell title={`${view.article.serial} @ ${view.stand.key}`}>
      <div className="mb-5">{picker}</div>

      {view.changedSinceLastRun && view.lastRunArticleConfig && resolvedArticleConfig ? (
        <div className="alert alert-warn mb-5">
          <div className="font-medium">
            ⚠ Configuration changed since the last run on {view.article.serial}
          </div>
          <div className="mt-1 text-sm">
            {view.lastRunArticleConfig.key} → {resolvedArticleConfig.key}.
            {changeDelta && changeDelta.length > 0
              ? ` ${changeDelta.length} BoM change(s) below.`
              : " Procedures/tests may have changed — review before working."}
          </div>
        </div>
      ) : view.lastRun ? (
        <div className="alert alert-ok mb-5">
          No configuration change since the last run on {view.article.serial}.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {resolvedArticleConfig ? (
          <Badge tone="ok">article: {resolvedArticleConfig.key}</Badge>
        ) : null}
        {resolvedStandConfig ? (
          <Badge tone="ok">stand: {resolvedStandConfig.key}</Badge>
        ) : null}
      </div>
      {resolutionProblem("article", articleResolution)}
      {resolutionProblem("stand", standResolution)}

      {changeDelta && changeDelta.length > 0 ? (
        <Panel className="mb-5">
          <h2 className="font-display">What changed</h2>
          <div className="mt-3">
            <DataTable
              headers={["Change", "Part", "Detail"]}
              rows={changeDelta.map((d) => [
                <Badge
                  key="t"
                  tone={
                    d.type === "added"
                      ? "ok"
                      : d.type === "removed"
                        ? "danger"
                        : "warn"
                  }
                >
                  {d.type}
                </Badge>,
                <span key="p" className="font-mono text-xs">
                  {d.partNumber}
                </span>,
                d.type === "changed" ? (
                  <span key="d">
                    {d.fromPartNumber !== d.toPartNumber
                      ? `${d.fromPartNumber}@${d.fromRevision} → ${d.toPartNumber}@${d.toRevision}`
                      : `rev ${d.fromRevision}→${d.toRevision}`}
                    {d.fromQty !== d.toQty ? ` · qty ${d.fromQty}→${d.toQty}` : ""}
                  </span>
                ) : (
                  <span key="d">
                    {d.name} @ {d.revision} × {d.qty}
                  </span>
                ),
              ])}
            />
          </div>
        </Panel>
      ) : null}

      {articleBundle && resolvedArticleConfig ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <h2 className="font-display">
              Build to: {resolvedArticleConfig.key}
            </h2>
            <div className="mt-3">
              <DataTable
                headers={["Find", "Part", "Rev", "Src", "Qty", "Avail", "Name"]}
                rows={[...articleBundle.bom]
                  .sort((a, b) => a.findNumber.localeCompare(b.findNumber))
                  .map((l) => {
                    const avail = stock.get(l.partRevisionId)?.available ?? 0;
                    const short = avail < l.qty;
                    return [
                      <span key="f" className="font-mono text-xs">
                        {l.findNumber}
                      </span>,
                      <span key="p" className="font-mono text-xs">
                        {l.partNumber}
                      </span>,
                      l.revision,
                      l.sourcing,
                      String(l.qty),
                      <span
                        key="a"
                        className={short ? "font-medium text-[var(--danger)]" : undefined}
                      >
                        {avail}
                        {short ? " short" : ""}
                      </span>,
                      l.name,
                    ];
                  })}
              />
            </div>
          </Panel>
          <div className="space-y-5">
            {[articleBundle, ...(standBundle ? [standBundle] : [])].map(
              (bundle) =>
                bundle.procedures.map((p) => (
                  <Panel key={p.id}>
                    <div className="font-mono text-xs text-[var(--muted)]">
                      {p.key} · v{p.version}
                    </div>
                    <div className="font-medium">{p.title}</div>
                    <pre className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
                      {p.body}
                    </pre>
                  </Panel>
                )),
            )}
            <Panel>
              <h2 className="font-display">Kit</h2>
              {activeKit ? (
                <>
                  <p className="mt-3 text-sm">
                    <Link
                      className="font-mono underline"
                      href={`/kits/${activeKit.id}`}
                    >
                      {activeKit.key}
                    </Link>
                    <span className="text-[var(--muted)]">
                      {" "}
                      · {activeKit.status} · per-line allocate on kit
                    </span>
                  </p>
                  {activeKit.status === "open" ||
                  activeKit.status === "reserved" ? (
                    <div className="mt-3">
                      <KitLifecycleButtons
                        kitId={activeKit.id}
                        articleId={view.article.id}
                        status={activeKit.status}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <CreateKitForm
                  articleId={view.article.id}
                  configId={resolvedArticleConfig.id}
                />
              )}
            </Panel>
            {floorShorts.length > 0 ? (
              <Panel>
                <h2 className="font-display">Shortages</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Buy/cots → PO. Make → work order. Completing a WO puts a lot in
                  the cage.
                </p>
                <ShortagePoForm configId={resolvedArticleConfig.id} />
                <ShortageWoForm configId={resolvedArticleConfig.id} />
              </Panel>
            ) : null}
          </div>
        </div>
      ) : null}

      {resolvedArticleConfig ? (
        <Panel className="mt-5">
          <h2 className="font-display">As-designed vs as-built</h2>
          {!asBuiltDelta ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              No covering config and no as-built yet.
            </p>
          ) : asBuiltDelta.lines.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              As-built matches the {asBuiltDelta.configKey} BoM.
            </p>
          ) : (
            <div className="mt-3">
              <DataTable
                headers={["Delta", "Part", "Rev", "Designed", "Built"]}
                rows={asBuiltDelta.lines.map((l) => [
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
          {asBuilt.length > 0 ? (
            <div className="mt-4">
              <DataTable
                compact
                headers={["Part", "Rev", "Qty", "Serial/Lot", ""]}
                rows={asBuilt.map((l) => [
                  <span key="p" className="font-mono text-xs">
                    {l.partNumber}
                  </span>,
                  l.revision,
                  String(l.qty),
                  l.serialOrLot ? (
                    <span key="sl" className="font-mono text-xs">
                      {l.serialOrLot}
                    </span>
                  ) : (
                    "—"
                  ),
                  <ReverseAsBuiltButton
                    key="rev"
                    asBuiltId={l.id}
                    articleId={view.article.id}
                  />,
                ])}
              />
            </div>
          ) : null}
        </Panel>
      ) : null}

      {standBundle && resolvedStandConfig ? (
        <Panel className="mt-5">
          <h2 className="font-display">
            Stand: {resolvedStandConfig.key}
          </h2>
          <div className="mt-3">
            <DataTable
              compact
              headers={["Find", "Part", "Rev", "Qty", "Avail", "Name"]}
              rows={[...standBundle.bom]
                .sort((a, b) => a.findNumber.localeCompare(b.findNumber))
                .map((l) => {
                  const avail = stock.get(l.partRevisionId)?.available ?? 0;
                  const short = avail < l.qty;
                  return [
                    <span key="f" className="font-mono text-xs">
                      {l.findNumber}
                    </span>,
                    <span key="p" className="font-mono text-xs">
                      {l.partNumber}
                    </span>,
                    l.revision,
                    String(l.qty),
                    <span
                      key="a"
                      className={short ? "font-medium text-[var(--danger)]" : undefined}
                    >
                      {avail}
                      {short ? " short" : ""}
                    </span>,
                    l.name,
                  ];
                })}
            />
          </div>
        </Panel>
      ) : null}
    </AppShell>
  );
}
