import Link from "next/link";
import { AppShell, Badge, DataTable, Panel, buttonClass, inputClass } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { getFloorView } from "../../lib/domain/floor";
import { diffBom } from "../../lib/impact";
import { getConfigBundle } from "../../lib/queries";
import { stockByRevision } from "../../lib/domain/inventory";
import { CreateKitForm } from "../../components/inventory-forms";

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
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          Article on the bench
          <select
            name="article"
            defaultValue={articleId}
            className={`mt-1 block ${inputClass}`}
          >
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.serial} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Stand
          <select
            name="stand"
            defaultValue={standId}
            className={`mt-1 block ${inputClass}`}
          >
            {stands.map((st) => (
              <option key={st.id} value={st.id}>
                {st.key}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className={buttonClass}
        >
          Show recipe
        </button>
      </form>
    </Panel>
  );

  if (!view) {
    return (
      <AppShell
        title="Floor"
        subtitle="Pick the article on your bench — Cadence shows the current recipe."
      >
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
          No released {kind} config covers this bench. Do not build or test —
          ask the responsible engineer to release one.
        </p>
      );
    }
    if (r.outcome === "conflict") {
      return (
        <p className="alert alert-danger">
          Config conflict: {r.candidates.map((c) => c.key).join(" vs ")}. A
          designer must fix effectivity before this bench can run.
        </p>
      );
    }
    return null;
  };

  return (
    <AppShell
      title={`${view.article.serial} @ ${view.stand.key}`}
      subtitle="Current recipe for this bench — resolved live from released configs."
    >
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
                headers={["Find", "Part", "Rev", "Qty", "Avail", "Name"]}
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
              <h2 className="font-display">Kit this recipe</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Reserve lots against {resolvedArticleConfig.key} for{" "}
                {view.article.serial}, then issue to stamp as-built.
              </p>
              <CreateKitForm
                articleId={view.article.id}
                configId={resolvedArticleConfig.id}
              />
            </Panel>
            <Panel>
              <h2 className="font-display">Next step</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Ready to run? Bind it on the{" "}
                <Link className="underline" href="/runs">
                  Runs
                </Link>{" "}
                page — the same resolution shown here is applied automatically.
              </p>
            </Panel>
          </div>
        </div>
      ) : null}

      {standBundle && resolvedStandConfig ? (
        <Panel className="mt-5">
          <h2 className="font-display">
            Stand recipe: {resolvedStandConfig.key}
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
