import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Badge, DataTable, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getConfigBundle } from "../../../lib/queries";
import {
  ApproveReleaseForm,
  ReleaseConfigForm,
  RequestReleaseForm,
} from "../../../components/forms";
import {
  AddBomLineForm,
  AddEffectivityForm,
  AddLinkForm,
  BomLineEditor,
  ConfigEditButton,
} from "../../../components/authoring-forms";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ConfigDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureAppData();
  const { id } = await params;
  const bundle = getConfigBundle(id);
  if (!bundle) notFound();

  const { config, bom, tests, procedures, effectivity, explicitArticles } =
    bundle;

  const basedOn = config.basedOnConfigId
    ? getDb()
        .select()
        .from(s.configurations)
        .where(eq(s.configurations.id, config.basedOnConfigId))
        .get()
    : null;

  const db = getDb();
  const stands = db.select().from(s.stands).all();
  const standById = Object.fromEntries(stands.map((st) => [st.id, st]));

  const isDraft = config.status === "draft";
  const partRevs = isDraft
    ? db
        .select({
          id: s.partRevisions.id,
          partNumber: s.parts.partNumber,
          revision: s.partRevisions.revision,
        })
        .from(s.partRevisions)
        .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
        .all()
        .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
    : [];
  const allTestDefs = isDraft ? db.select().from(s.testDefinitions).all() : [];
  const allProcedures = isDraft ? db.select().from(s.procedures).all() : [];
  const allArticles = isDraft ? db.select().from(s.articles).all() : [];

  return (
    <AppShell
      title={config.key}
      subtitle={config.name}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={config.kind === "stand" ? "accent" : "neutral"}>
          {config.kind}
        </Badge>
        <Badge
          tone={
            config.status === "released"
              ? "ok"
              : config.status === "in_review"
                ? "accent"
                : "warn"
          }
        >
          {config.status}
        </Badge>
        <Badge tone={config.riskClass === "R3" ? "danger" : "neutral"}>
          {config.riskClass}
        </Badge>
        {basedOn ? (
          <span className="text-sm text-[var(--muted)]">
            based on{" "}
            <Link className="font-mono underline" href={`/configs/${basedOn.id}`}>
              {basedOn.key}
            </Link>
          </span>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">BoM pins</h2>
          <div className="mt-3">
            <DataTable
              headers={
                isDraft
                  ? ["Part", "Name", "Rev / Qty / Find", ""]
                  : ["Find", "Part", "Rev", "Qty", "Name"]
              }
              rows={bom
                .slice()
                .sort((a, b) => a.findNumber.localeCompare(b.findNumber))
                .map((l) => {
                  if (!isDraft) {
                    return [
                      <span key="f" className="font-mono text-xs">
                        {l.findNumber}
                      </span>,
                      <span key="p" className="font-mono text-xs">
                        {l.partNumber}
                      </span>,
                      l.revision,
                      String(l.qty),
                      l.name,
                    ];
                  }
                  const revOptions = partRevs
                    .filter((p) => p.partNumber === l.partNumber)
                    .map((p) => ({ id: p.id, label: `rev ${p.revision}` }));
                  return [
                    <span key="p" className="font-mono text-xs">
                      {l.partNumber}
                    </span>,
                    l.name,
                    <BomLineEditor
                      key="e"
                      configId={config.id}
                      bomLineId={l.id}
                      revOptions={revOptions}
                      currentRevId={l.partRevisionId}
                      qty={l.qty}
                      findNumber={l.findNumber}
                    />,
                    <ConfigEditButton
                      key="rm"
                      label="remove"
                      payload={{
                        op: "remove_bom",
                        configId: config.id,
                        bomLineId: l.id,
                      }}
                    />,
                  ];
                })}
            />
          </div>
          {isDraft ? (
            <AddBomLineForm
              configId={config.id}
              partRevs={partRevs.map((p) => ({
                id: p.id,
                label: `${p.partNumber} @ ${p.revision}`,
              }))}
            />
          ) : null}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-xl">Effectivity</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {effectivity.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md bg-[var(--panel-strong)] px-3 py-2"
                >
                  <div>
                    Articles:{" "}
                    {e.articleScope === "any"
                      ? "any"
                      : e.articleScope === "serial_range"
                        ? [
                            e.serialFrom ? `from ${e.serialFrom}` : null,
                            e.serialTo ? `to ${e.serialTo}` : null,
                          ]
                            .filter(Boolean)
                            .join(" ") || "range"
                        : explicitArticles
                            .filter((a) => a.effectivityId === e.id)
                            .map((a) => a.serial)
                            .join(", ") || "explicit list"}
                  </div>
                  <div>
                    Stand:{" "}
                    {e.standScope === "any"
                      ? "any"
                      : e.standId
                        ? standById[e.standId]?.key
                        : "—"}
                  </div>
                  {isDraft ? (
                    <div className="mt-1">
                      <ConfigEditButton
                        label="remove"
                        payload={{
                          op: "remove_eff",
                          configId: config.id,
                          effectivityId: e.id,
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {isDraft ? (
              <AddEffectivityForm
                configId={config.id}
                stands={stands.map((st) => ({ id: st.id, key: st.key }))}
                articles={allArticles.map((a) => ({
                  id: a.id,
                  serial: a.serial,
                }))}
              />
            ) : null}
          </Panel>

          {config.status === "draft" ? (
            <Panel>
              <h2 className="font-display text-xl">Release</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {config.riskClass === "R3"
                  ? "R3: a second person must approve — request first."
                  : "Soft gate — tests may still be draft."}
              </p>
              {config.riskClass === "R3" ? (
                <RequestReleaseForm configId={config.id} />
              ) : (
                <ReleaseConfigForm
                  configId={config.id}
                  hasBase={Boolean(config.basedOnConfigId)}
                />
              )}
            </Panel>
          ) : config.status === "in_review" ? (
            <Panel>
              <h2 className="font-display text-xl">Awaiting review</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Requested by {config.releaseRequestedBy} ·{" "}
                {config.releaseRequestedAt}
              </p>
              <ApproveReleaseForm
                configId={config.id}
                requestedBy={config.releaseRequestedBy ?? ""}
                hasBase={Boolean(config.basedOnConfigId)}
              />
            </Panel>
          ) : (
            <Panel>
              <h2 className="font-display text-xl">
                {config.status === "superseded" ? "Superseded" : "Released"}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                by {config.releasedBy}
                {config.reviewerAckBy
                  ? ` · reviewer ${config.reviewerAckBy}`
                  : ""}
              </p>
            </Panel>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="font-display text-xl">Required tests</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {tests.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="font-mono text-xs text-[var(--accent)]">
                  {t.key}
                </span>
                <span>{t.name}</span>
                {isDraft ? (
                  <ConfigEditButton
                    label="remove"
                    payload={{
                      op: "remove_test",
                      configId: config.id,
                      testDefinitionId: t.id,
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {isDraft ? (
            <AddLinkForm
              configId={config.id}
              op="add_test"
              fieldName="testDefinitionId"
              label="Require"
              options={allTestDefs.map((t) => ({
                id: t.id,
                label: `${t.key} — ${t.name}`,
              }))}
            />
          ) : null}
        </Panel>
        <Panel>
          <h2 className="font-display text-xl">Procedures</h2>
          <div className="mt-3 space-y-4">
            {procedures.map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-xs text-[var(--accent)]">
                    {p.key} · v{p.version}
                  </div>
                  {isDraft ? (
                    <ConfigEditButton
                      label="remove"
                      payload={{
                        op: "remove_proc",
                        configId: config.id,
                        procedureId: p.id,
                      }}
                    />
                  ) : null}
                </div>
                <div className="font-medium">{p.title}</div>
                <pre className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
                  {p.body}
                </pre>
              </div>
            ))}
          </div>
          {isDraft ? (
            <AddLinkForm
              configId={config.id}
              op="add_proc"
              fieldName="procedureId"
              label="Link"
              options={allProcedures.map((p) => ({
                id: p.id,
                label: `${p.key} — ${p.title}`,
              }))}
            />
          ) : null}
        </Panel>
      </div>

      {config.notes ? (
        <Panel className="mt-5">
          <h2 className="font-display text-xl">Notes</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{config.notes}</p>
        </Panel>
      ) : null}
    </AppShell>
  );
}
