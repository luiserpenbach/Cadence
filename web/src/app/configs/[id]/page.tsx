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
  AddAlternateForm,
  AddBomLineForm,
  AddEffectivityForm,
  AddLinkForm,
  BomLineEditor,
  ConfigEditButton,
} from "../../../components/authoring-forms";
import { ImportBomForm } from "../../../components/inventory-forms";
import { AttachmentsPanel } from "../../../components/attachments-panel";
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
  const partRevOptions = partRevs.map((p) => ({
    id: p.id,
    label: `${p.partNumber} @ ${p.revision}`,
  }));
  const revLabel = Object.fromEntries(partRevOptions.map((p) => [p.id, p.label]));
  const alternates = db.select().from(s.configBomAlternates).all();
  const altsByLine = new Map<string, typeof alternates>();
  for (const a of alternates) {
    const list = altsByLine.get(a.bomLineId) ?? [];
    list.push(a);
    altsByLine.set(a.bomLineId, list);
  }
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
          <p className="mt-1 text-sm text-[var(--muted)]">
            <a className="underline" href={`/configs/${config.id}/bom.csv`}>
              Export CSV
            </a>
          </p>
          <div className="mt-3">
            <DataTable
              empty="No pins yet — add one or import CSV."
              headers={
                isDraft
                  ? ["Find / Part", "Name", "Rev / Qty / Notes", ""]
                  : ["Find", "Part", "Rev", "Qty", "Name", "Notes"]
              }
              rows={bom
                .slice()
                .sort((a, b) => a.findNumber.localeCompare(b.findNumber))
                .map((l) => {
                  const lineAlts = altsByLine.get(l.id) ?? [];
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
                      <span key="n" className="text-[var(--muted)]">
                        {l.notes || "—"}
                        {lineAlts.length
                          ? ` · alts ${lineAlts.map((a) => revLabel[a.partRevisionId] ?? a.partRevisionId).join(", ")}`
                          : ""}
                      </span>,
                    ];
                  }
                  return [
                    <div key="p">
                      <div className="font-mono text-xs">{l.findNumber || "—"}</div>
                      <div className="font-mono text-xs">{l.partNumber}</div>
                    </div>,
                    l.name,
                    <div key="e" className="space-y-2">
                      <BomLineEditor
                        configId={config.id}
                        bomLineId={l.id}
                        revOptions={partRevOptions}
                        currentRevId={l.partRevisionId}
                        qty={l.qty}
                        findNumber={l.findNumber}
                        notes={l.notes}
                      />
                      <div className="text-xs text-[var(--muted)]">
                        Alts:{" "}
                        {lineAlts.length
                          ? lineAlts.map((a) => (
                              <span key={a.id} className="mr-2">
                                {revLabel[a.partRevisionId] ?? a.partRevisionId}{" "}
                                <ConfigEditButton
                                  label="×"
                                  payload={{
                                    op: "remove_alt",
                                    configId: config.id,
                                    bomLineId: l.id,
                                    partRevisionId: a.partRevisionId,
                                  }}
                                />
                              </span>
                            ))
                          : "none"}
                      </div>
                    </div>,
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
            <>
              <AddBomLineForm configId={config.id} partRevs={partRevOptions} />
              <AddAlternateForm
                configId={config.id}
                lines={bom.map((l) => ({
                  id: l.id,
                  label: `${l.findNumber || "—"} ${l.partNumber} @ ${l.revision}`,
                }))}
                partRevs={partRevOptions}
              />
              <ImportBomForm configId={config.id} />
            </>
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

      <Panel className="mt-5">
        <h2 className="font-display text-xl">Attachments</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Reference material for this config — release evidence, reports,
          drawings. Attachments are metadata, not pins.
        </p>
        <div className="mt-2">
          <AttachmentsPanel entityType="configuration" entityId={config.id} />
        </div>
      </Panel>

      {config.notes ? (
        <Panel className="mt-5">
          <h2 className="font-display text-xl">Notes</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{config.notes}</p>
        </Panel>
      ) : null}
    </AppShell>
  );
}
