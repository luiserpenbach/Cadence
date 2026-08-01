import Link from "next/link";
import { AppShell, Badge, Panel } from "../components/ui";
import { ensureAppData } from "../lib/bootstrap";
import { getDb } from "../db";
import * as s from "../db/schema";
import { getRunVerification } from "../lib/queries";
import { buildImpactReport, getDefaultDelta } from "../lib/impact";

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

  if (parts.length === 0 && configs.length === 0) {
    return (
      <AppShell
        title="Empty database"
        subtitle="Author your product from scratch, or load the cryo demo dataset."
      >
        <Panel>
          <ol className="space-y-2 text-sm text-[var(--muted)]">
            <li>
              1. Author parts in the{" "}
              <Link className="underline" href="/catalog">
                Catalog
              </Link>
              , articles, and stands
            </li>
            <li>
              2. Create a config on{" "}
              <Link className="underline" href="/configs">
                Configs
              </Link>{" "}
              — pin BoM, tests, procedures, effectivity — and release it
            </li>
            <li>
              3. Bind a run on{" "}
              <Link className="underline" href="/runs">
                Runs
              </Link>{" "}
              — the resolver picks the configs
            </li>
          </ol>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Or load demo data:{" "}
            <code className="rounded bg-[var(--panel-strong)] px-1.5 py-0.5 font-mono text-xs">
              npm run db:seed
            </code>
          </p>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Overnight cut-in, under control"
      subtitle="Designers release article and stand configs; the bench binds runs to both; gaps warn instead of blocking."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                Active delta
              </div>
              <h2 className="mt-1 font-display text-2xl">
                {delta ? `${delta.from.key} → ${delta.to.key}` : "No delta yet"}
              </h2>
            </div>
            {delta ? (
              <Badge tone={delta.to.riskClass === "R3" ? "danger" : "neutral"}>
                {delta.to.riskClass} release
              </Badge>
            ) : null}
          </div>
          {impact ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Stat
                label="BoM deltas"
                value={String(impact.bomDeltas.length)}
                hint="pins changed"
              />
              <Stat
                label="Inventory gaps"
                value={String(impact.inventoryShortages.length)}
                hint="short lots"
              />
              <Stat
                label="Articles on prior"
                value={String(impact.articlesOnPrior.length)}
                hint="still on N"
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Release a config cut from another to see its blast radius here.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/change"
              className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)]"
            >
              Open change impact
            </Link>
            <Link
              href={delta ? `/configs/${delta.to.id}` : "/configs"}
              className="rounded-md border border-[var(--line)] px-4 py-2 text-sm"
            >
              {delta ? `View ${delta.to.key}` : "View configs"}
            </Link>
          </div>
        </Panel>

        <Panel>
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
            Verification
          </div>
          <h2 className="mt-1 font-display text-2xl">Record &amp; warn</h2>
          {verification && activeRun ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
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
            <p className="mt-4 text-sm text-[var(--muted)]">No active run.</p>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Parts" value={parts.length} href="/catalog" />
        <MiniStat label="Configs" value={configs.length} href="/configs" />
        <MiniStat label="Articles" value={articles.length} href="/articles" />
        <MiniStat label="Runs" value={runs.length} href="/runs" />
      </div>

      <Panel className="mt-5">
        <h2 className="font-display text-xl">First-win loop</h2>
        <ol className="mt-3 grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
          <li>1. Author parts &amp; BoM pins in Cadence</li>
          <li>2. Release article + stand configs</li>
          <li>3. Capture as-built on proto serials</li>
          <li>4. Bind run to (article, stand, both configs)</li>
          <li>5. Record tests — warn on gaps, ack to proceed</li>
          <li>6. Cut N+1 overnight; read blast radius</li>
        </ol>
      </Panel>
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
    <div className="rounded-lg bg-[var(--panel-strong)] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className="font-display text-3xl">{value}</div>
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
    <Link href={href}>
      <Panel>
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
          {label}
        </div>
        <div className="font-display text-3xl">{value}</div>
      </Panel>
    </Link>
  );
}
