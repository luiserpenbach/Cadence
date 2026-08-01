import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { getRunVerification } from "../../../lib/queries";
import {
  AckGapsForm,
  RecordTestForm,
  RunLifecycleForm,
  StartExecutionForm,
  WaiverForm,
} from "../../../components/forms";
import { listRunProcedureStatus } from "../../../lib/domain/execution";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureAppData();
  const { id } = await params;
  const db = getDb();
  const run = db.select().from(s.runs).where(eq(s.runs.id, id)).get();
  if (!run) notFound();

  const article = db
    .select()
    .from(s.articles)
    .where(eq(s.articles.id, run.articleId))
    .get()!;
  const stand = db
    .select()
    .from(s.stands)
    .where(eq(s.stands.id, run.standId))
    .get()!;
  const articleConfig = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, run.articleConfigId))
    .get()!;
  const standConfig = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, run.standConfigId))
    .get()!;

  const verification = getRunVerification(run.id);
  const results = db
    .select({
      status: s.testResults.status,
      value: s.testResults.value,
      key: s.testDefinitions.key,
      name: s.testDefinitions.name,
      recordedBy: s.testResults.recordedBy,
    })
    .from(s.testResults)
    .innerJoin(
      s.testDefinitions,
      eq(s.testResults.testDefinitionId, s.testDefinitions.id),
    )
    .where(eq(s.testResults.runId, run.id))
    .all();

  const missing = verification.gaps.filter((g) => g.status === "missing");
  const waivable = verification.gaps.filter((g) => g.status !== "waived");
  const procedureStatus = listRunProcedureStatus(db, run.id);

  return (
    <AppShell title={run.key} subtitle={`Bound run on ${article.serial} @ ${stand.key}`}>
      {articleConfig.status === "superseded" ||
      standConfig.status === "superseded" ? (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-100 px-4 py-3 text-amber-950">
          <div className="font-medium">
            ⚠ This run is bound to a superseded config
          </div>
          <div className="mt-1 text-sm">
            {articleConfig.status === "superseded"
              ? `${articleConfig.key} has been superseded. `
              : ""}
            {standConfig.status === "superseded"
              ? `${standConfig.key} has been superseded. `
              : ""}
            New runs will bind the current released config — check the{" "}
            <Link className="underline" href="/change">
              change impact
            </Link>{" "}
            before reusing results from this run.
          </div>
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="accent">{run.status}</Badge>
        {verification.gaps.length ? (
          <Badge tone={verification.unacknowledgedCount ? "warn" : "accent"}>
            {verification.gaps.length} gaps
          </Badge>
        ) : (
          <Badge tone="ok">clear</Badge>
        )}
        {verification.unacknowledgedCount ? (
          <Badge tone="warn">
            {verification.unacknowledgedCount} unacknowledged
          </Badge>
        ) : verification.gaps.length ? (
          <Badge tone="accent">all gaps acknowledged</Badge>
        ) : null}
        <div className="ml-auto">
          {run.status === "planned" ? (
            <RunLifecycleForm runId={run.id} transition="start" />
          ) : run.status === "in_progress" ? (
            <RunLifecycleForm runId={run.id} transition="complete" />
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">Binding</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Article</dt>
              <dd className="font-mono">
                {article.serial} — {article.name}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Stand</dt>
              <dd className="font-mono">
                {stand.key} — {stand.name}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Article config</dt>
              <dd>
                <Link
                  className="font-mono underline"
                  href={`/configs/${articleConfig.id}`}
                >
                  {articleConfig.key}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Stand config</dt>
              <dd>
                <Link
                  className="font-mono underline"
                  href={`/configs/${standConfig.id}`}
                >
                  {standConfig.key}
                </Link>
              </dd>
            </div>
          </dl>

          <h2 className="mt-6 font-display text-xl">Verification gaps</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Record-and-warn: you can proceed after acknowledging gaps.
          </p>
          <ul className="mt-3 space-y-2">
            {verification.gaps.map((g) => (
              <li
                key={g.testDefinitionId + g.source}
                className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--panel-strong)] px-3 py-2 text-sm"
              >
                <Badge
                  tone={
                    g.status === "fail"
                      ? "danger"
                      : g.status === "waived"
                        ? "accent"
                        : "warn"
                  }
                >
                  {g.status}
                </Badge>
                <Badge tone="neutral">{g.source}</Badge>
                <span className="font-mono text-xs">{g.key}</span>
                <span>{g.name}</span>
                <span className="text-[var(--muted)]">{g.detail}</span>
                {g.acknowledged ? <Badge tone="accent">acked</Badge> : null}
              </li>
            ))}
            {verification.gaps.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">No gaps.</li>
            ) : null}
          </ul>

          {verification.acks.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-[var(--muted)]">
              {verification.acks.map((a) => (
                <li key={a.id}>
                  Acknowledged by {a.ackBy} · {a.ackAt}: {a.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {verification.unacknowledgedCount > 0 ? (
            <AckGapsForm runId={run.id} />
          ) : null}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-xl">Record test</h2>
            {missing.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                No missing required tests.
              </p>
            ) : (
              <RecordTestForm
                runId={run.id}
                missing={missing.map((g) => ({
                  testDefinitionId: g.testDefinitionId,
                  key: g.key,
                }))}
              />
            )}
          </Panel>

          <Panel>
            <h2 className="font-display text-xl">Waive test</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Waivers are explicit objects — who, why, which test. Never a
              silent green.
            </p>
            {waivable.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                No open gaps to waive.
              </p>
            ) : (
              <WaiverForm
                runId={run.id}
                waivable={waivable.map((g) => ({
                  testDefinitionId: g.testDefinitionId,
                  key: g.key,
                }))}
              />
            )}
          </Panel>
        </div>
      </div>

      <Panel className="mt-5">
        <h2 className="font-display text-xl">Procedures (as-run)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Procedures execute step by step against this run — each step is a
          signed record, not a checkbox on a PDF.
        </p>
        <ul className="mt-3 space-y-2">
          {procedureStatus.map((p) => (
            <li
              key={p.procedureId + p.source}
              className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--panel-strong)] px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-[var(--accent)]">
                {p.procedureKey} · v{p.version}
              </span>
              <span>{p.procedureTitle}</span>
              <Badge tone="neutral">{p.source}</Badge>
              {p.latest ? (
                <>
                  <Badge
                    tone={
                      p.latest.status === "complete"
                        ? "ok"
                        : p.latest.status === "aborted"
                          ? "danger"
                          : "accent"
                    }
                  >
                    {p.latest.status} · {p.latest.recordedCount}/{p.stepCount}
                  </Badge>
                  {p.latest.flaggedCount > 0 ? (
                    <Badge tone="danger">
                      {p.latest.flaggedCount} flagged
                    </Badge>
                  ) : null}
                  <Link
                    className="text-xs underline"
                    href={`/runs/${run.id}/execute/${p.latest.executionId}`}
                  >
                    open
                  </Link>
                  {p.latest.status !== "in_progress" &&
                  run.status === "in_progress" ? (
                    <StartExecutionForm
                      runId={run.id}
                      procedureId={p.procedureId}
                    />
                  ) : null}
                </>
              ) : run.status === "in_progress" ? (
                <StartExecutionForm runId={run.id} procedureId={p.procedureId} />
              ) : (
                <span className="text-xs text-[var(--muted)]">
                  start the run to execute
                </span>
              )}
            </li>
          ))}
          {procedureStatus.length === 0 ? (
            <li className="text-sm text-[var(--muted)]">
              No procedures bound to this run&apos;s configs.
            </li>
          ) : null}
        </ul>
      </Panel>

      <Panel className="mt-5">
        <h2 className="font-display text-xl">Recorded results</h2>
        <div className="mt-3">
          <DataTable
            headers={["Test", "Status", "Value", "By"]}
            rows={results.map((r) => [
              <span key="k" className="font-mono text-xs">
                {r.key}
              </span>,
              <Badge
                key="s"
                tone={
                  r.status === "pass"
                    ? "ok"
                    : r.status === "fail"
                      ? "danger"
                      : "warn"
                }
              >
                {r.status}
              </Badge>,
              r.value || "—",
              r.recordedBy,
            ])}
          />
        </div>
      </Panel>
    </AppShell>
  );
}
