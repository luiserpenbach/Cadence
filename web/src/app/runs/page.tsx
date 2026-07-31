import Link from "next/link";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { getRunVerification } from "../../lib/queries";
import { NewRunForm } from "../../components/forms";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  ensureAppData();
  const db = getDb();
  const runs = db.select().from(s.runs).all();
  const articleRows = db.select().from(s.articles).all();
  const standRows = db.select().from(s.stands).all();
  const articles = Object.fromEntries(
    db
      .select()
      .from(s.articles)
      .all()
      .map((a) => [a.id, a]),
  );
  const stands = Object.fromEntries(
    db
      .select()
      .from(s.stands)
      .all()
      .map((st) => [st.id, st]),
  );
  const configs = Object.fromEntries(
    db
      .select()
      .from(s.configurations)
      .all()
      .map((c) => [c.id, c]),
  );

  return (
    <AppShell
      title="Runs"
      subtitle="Run = article + article config + stand + stand config. Verification is record-and-warn."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
        <DataTable
          headers={[
            "Run",
            "Article",
            "Stand",
            "Article cfg",
            "Stand cfg",
            "Gaps",
            "Status",
          ]}
          rows={runs.map((r) => {
            const v = getRunVerification(r.id);
            return [
              <Link
                key="k"
                href={`/runs/${r.id}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {r.key}
              </Link>,
              articles[r.articleId]?.serial ?? "—",
              stands[r.standId]?.key ?? "—",
              <span key="ac" className="font-mono text-xs">
                {configs[r.articleConfigId]?.key}
              </span>,
              <span key="sc" className="font-mono text-xs">
                {configs[r.standConfigId]?.key}
              </span>,
              <Badge
                key="g"
                tone={
                  v.unacknowledgedCount
                    ? "warn"
                    : v.gaps.length
                      ? "accent"
                      : "ok"
                }
              >
                {v.gaps.length}
                {v.gaps.length > 0 && v.unacknowledgedCount === 0
                  ? " · ack"
                  : ""}
              </Badge>,
              <Badge
                key="st"
                tone={r.status === "in_progress" ? "accent" : "neutral"}
              >
                {r.status}
              </Badge>,
            ];
          })}
        />
        </Panel>

        <Panel>
          <h2 className="font-display text-xl">New run</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pick article and stand — the resolver binds the most specific
            released configs. Conflicts and missing configs block.
          </p>
          <NewRunForm
            articles={articleRows.map((a) => ({
              id: a.id,
              serial: a.serial,
              name: a.name,
            }))}
            stands={standRows.map((st) => ({
              id: st.id,
              key: st.key,
              name: st.name,
            }))}
          />
        </Panel>
      </div>
    </AppShell>
  );
}
