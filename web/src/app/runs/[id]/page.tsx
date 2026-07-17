import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { getRunVerification } from "../../../lib/queries";
import { acknowledgeRunGaps, recordTestResult } from "../../../lib/actions";

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

  return (
    <AppShell title={run.key} subtitle={`Bound run on ${article.serial} @ ${stand.key}`}>
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="accent">{run.status}</Badge>
        {verification.gaps.length ? (
          <Badge tone="warn">{verification.gaps.length} gaps</Badge>
        ) : (
          <Badge tone="ok">clear</Badge>
        )}
        {run.gapAcknowledged ? <Badge tone="accent">gap acknowledged</Badge> : null}
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
              </li>
            ))}
            {verification.gaps.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">No gaps.</li>
            ) : null}
          </ul>

          {run.gapAcknowledged ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Acknowledged by {run.gapAckBy}: {run.gapAckReason}
            </p>
          ) : (
            <form action={acknowledgeRunGaps} className="mt-4 space-y-2">
              <input type="hidden" name="runId" value={run.id} />
              <input
                name="by"
                defaultValue="m.chen"
                className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
              />
              <textarea
                name="reason"
                required
                placeholder="Why proceed with gaps?"
                className="min-h-20 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-[var(--accent-hot)] px-4 py-2 text-sm text-white"
              >
                Acknowledge gaps &amp; proceed
              </button>
            </form>
          )}
        </Panel>

        <Panel>
          <h2 className="font-display text-xl">Record test</h2>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              No missing required tests.
            </p>
          ) : (
            <form action={recordTestResult} className="mt-3 space-y-2">
              <input type="hidden" name="runId" value={run.id} />
              <select
                name="testDefinitionId"
                className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
              >
                {missing.map((g) => (
                  <option key={g.testDefinitionId} value={g.testDefinitionId}>
                    {g.key}
                  </option>
                ))}
              </select>
              <select
                name="status"
                className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
                defaultValue="pass"
              >
                <option value="pass">pass</option>
                <option value="fail">fail</option>
                <option value="waived">waived</option>
              </select>
              <input
                name="value"
                placeholder="Measured value / notes"
                className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
              />
              <input
                name="by"
                defaultValue="tech.lee"
                className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)]"
              >
                Save result
              </button>
            </form>
          )}
        </Panel>
      </div>

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
