import Link from "next/link";
import { AppShell, Badge, Panel, buttonClass, subtleButtonClass } from "../components/ui";
import { ensureAppData } from "../lib/bootstrap";
import { getDb } from "../db";
import * as s from "../db/schema";
import { getRunVerification } from "../lib/queries";
import { buildImpactReport, getDefaultDelta } from "../lib/impact";
import { issueCounts, listIssues } from "../lib/domain/issues";
import { listAudit } from "../lib/domain/audit";
import { formatWhen, severityTone } from "../components/issues-ui";

export const dynamic = "force-dynamic";

export default function HomePage() {
  ensureAppData();
  const db = getDb();

  const configs = db.select().from(s.configurations).all();
  const articles = db.select().from(s.articles).all();
  const runs = db.select().from(s.runs).all();
  const parts = db.select().from(s.parts).all();

  const delta = getDefaultDelta();
  const activeRun = runs.find((r) => r.status === "in_progress");
  const verification = activeRun ? getRunVerification(activeRun.id) : null;
  const impact = delta ? buildImpactReport(delta.from.id, delta.to.id) : null;

  // The attention queue: things waiting on a person, most urgent first.
  const inReview = configs.filter((c) => c.status === "in_review");
  const runsWithGaps = runs
    .filter((r) => r.status !== "complete")
    .slice(-25)
    .map((r) => ({ run: r, v: getRunVerification(r.id) }))
    .filter((x) => x.v.unacknowledgedCount > 0);
  const issues = listIssues(db).slice(0, 6);
  const counts = issueCounts(db);
  const attentionCount =
    inReview.length + runsWithGaps.length + counts.open + counts.dispositioned;
  const recent = listAudit(db, { limit: 7 });

  if (parts.length === 0 && configs.length === 0) {
    return (
      <AppShell title="Overview">
        <Panel>
          <ol className="space-y-2 text-sm text-[var(--muted)]">
            <li>
              1. Load parts in the{" "}
              <Link className="underline" href="/catalog">
                Catalog
              </Link>{" "}
              (one-by-one or CSV).
            </li>
            <li>
              2. Register hardware on{" "}
              <Link className="underline" href="/articles">
                Articles
              </Link>{" "}
              and the cell on{" "}
              <Link className="underline" href="/stands">
                Stands
              </Link>
              .
            </li>
            <li>
              3. Write procedures and test defs (with units and limits) on{" "}
              <Link className="underline" href="/procedures">
                Procedures
              </Link>
              .
            </li>
            <li>
              4. Pin a BoM, tests, procedures, and effectivity on{" "}
              <Link className="underline" href="/configs">
                Configs
              </Link>
              , then release.
            </li>
            <li>
              5. Kit, buy, and make from the{" "}
              <Link className="underline" href="/floor">
                Floor
              </Link>
              . Bind a run when you fire.
            </li>
          </ol>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell title="Overview">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display">Active delta</h2>
              <div className="mt-1.5 font-mono text-[1.05rem] tracking-tight">
                {delta ? `${delta.from.key} → ${delta.to.key}` : "No delta yet"}
              </div>
            </div>
            {delta ? (
              <Badge tone={delta.to.riskClass === "R3" ? "danger" : "neutral"}>
                {delta.to.riskClass} release
              </Badge>
            ) : null}
          </div>
          {impact ? (
            <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-[var(--line-soft)] bg-[var(--line-soft)] sm:grid-cols-3">
              <Stat
                label="BoM deltas"
                value={String(impact.bomDeltas.length)}
                hint="changed"
              />
              <Stat
                label="Inventory gaps"
                value={String(impact.inventoryShortages.length)}
                hint="short"
              />
              <Stat
                label="Articles on prior"
                value={String(impact.articlesOnPrior.length)}
                hint="still on N"
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Release a config cut from another to see the delta here.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/change" className={buttonClass}>
              Change impact
            </Link>
            <Link
              href={delta ? `/configs/${delta.to.id}` : "/configs"}
              className={subtleButtonClass}
            >
              {delta ? `View ${delta.to.key}` : "View configs"}
            </Link>
          </div>
        </Panel>

        <Panel>
          <h2 className="font-display">Verification</h2>
          {verification && activeRun ? (
            <div className="mt-3 space-y-3">
              <div className="font-mono text-sm tracking-tight">{activeRun.key}</div>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  tone={verification.unacknowledgedCount ? "warn" : "ok"}
                >
                  {verification.gaps.length} gaps
                </Badge>
                <Badge tone="ok">{verification.passes.length} pass</Badge>
                {verification.gaps.length > 0 &&
                verification.unacknowledgedCount === 0 ? (
                  <Badge tone="accent">gaps acked</Badge>
                ) : null}
              </div>
              <p className="text-sm text-[var(--muted)]">
                Run{" "}
                <Link className="underline" href={`/runs/${activeRun.id}`}>
                  {activeRun.key}
                </Link>
                {verification.acks.length
                  ? ` · ack by ${verification.acks[verification.acks.length - 1].ackBy}`
                  : ""}
              </p>
              <ul className="space-y-1 text-sm">
                {verification.gaps.slice(0, 4).map((g) => (
                  <li key={g.testDefinitionId + g.source} className="flex gap-2">
                    <Badge tone={g.status === "fail" ? "danger" : "warn"}>
                      {g.status}
                    </Badge>
                    <span className="font-mono text-xs">{g.key}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">No active run.</p>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display">Needs attention</h2>
            <span className="font-mono text-xs text-[var(--muted)]">
              {attentionCount}
            </span>
          </div>
          {attentionCount === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Nothing is waiting on anyone.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line-soft)] text-sm">
              {inReview.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge tone="accent">review</Badge>
                  <Link className="font-mono text-xs underline" href={`/configs/${c.id}`}>
                    {c.key}
                  </Link>
                  <span>
                    {c.riskClass} release requested by {c.releaseRequestedBy} —
                    needs a second approver
                  </span>
                </li>
              ))}
              {issues.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
                  <Link className="font-mono text-xs underline" href={`/issues/${i.id}`}>
                    {i.key}
                  </Link>
                  <span>{i.title}</span>
                  <span className="text-[var(--muted)]">
                    {i.status === "open"
                      ? "awaiting disposition"
                      : `${i.disposition.replaceAll("_", " ")} — awaiting closure`}
                    {i.articleSerial ? ` · ${i.articleSerial}` : ""}
                  </span>
                </li>
              ))}
              {runsWithGaps.map(({ run, v }) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge tone="warn">gaps</Badge>
                  <Link className="font-mono text-xs underline" href={`/runs/${run.id}`}>
                    {run.key}
                  </Link>
                  <span>
                    {v.unacknowledgedCount} unacknowledged verification{" "}
                    {v.unacknowledgedCount === 1 ? "gap" : "gaps"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {counts.open + counts.dispositioned > issues.length ? (
            <Link className="mt-2 inline-block text-xs underline" href="/issues">
              All {counts.open + counts.dispositioned} unresolved issues
            </Link>
          ) : null}
        </Panel>

        <Panel>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display">Recent activity</h2>
            <Link className="text-xs text-[var(--muted)] underline" href="/activity">
              All
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Changes show up here as people make them.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5 text-sm">
              {recent.map((e) => (
                <li key={e.seq}>
                  <div>{e.summary}</div>
                  <div className="font-mono text-[11px] text-[var(--muted)]">
                    {e.actor || "unknown"} · {formatWhen(e.at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-[var(--line-soft)] bg-[var(--line-soft)] sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat label="Parts" value={parts.length} href="/catalog" />
        <MiniStat label="Configs" value={configs.length} href="/configs" />
        <MiniStat label="Articles" value={articles.length} href="/articles" />
        <MiniStat label="Runs" value={runs.length} href="/runs" />
        <MiniStat
          label="Unresolved issues"
          value={counts.open + counts.dispositioned}
          href="/issues"
        />
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-[var(--panel)] px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="block bg-[var(--panel)] px-3.5 py-3 hover:bg-[var(--panel-strong)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl tabular-nums tracking-tight">{value}</div>
    </Link>
  );
}
