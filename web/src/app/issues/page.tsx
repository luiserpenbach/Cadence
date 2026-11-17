import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { issueCounts, listIssues } from "../../lib/domain/issues";
import { CreateIssueForm } from "../../components/issue-forms";
import {
  IssueSubject,
  formatWhen,
  issueStatusTone,
  severityTone,
} from "../../components/issues-ui";

export const dynamic = "force-dynamic";

const views = [
  { id: "active", label: "Unresolved" },
  { id: "open", label: "Awaiting disposition" },
  { id: "dispositioned", label: "Awaiting closure" },
  { id: "all", label: "All" },
] as const;

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  ensureAppData();
  const sp = await searchParams;
  const view = views.find((v) => v.id === sp.view)?.id ?? "active";
  const db = getDb();
  const issues = listIssues(db, { status: view });
  const counts = issueCounts(db);

  const articles = db.select().from(s.articles).all();
  const runs = db.select().from(s.runs).all();
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
  const revLabel = Object.fromEntries(
    partRevs.map((p) => [p.id, `${p.partNumber} @ ${p.revision}`]),
  );
  const lots = db.select().from(s.inventoryLots).all();

  return (
    <AppShell
      title="Issues"
      subtitle="Nonconformances against real hardware. Unresolved issues warn on every run, kit, and lot they touch."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {views.map((v) => (
          <Link
            key={v.id}
            href={v.id === "active" ? "/issues" : `/issues?view=${v.id}`}
            className={`rounded-md px-2.5 py-1 text-[13px] ${
              v.id === view
                ? "bg-[var(--panel-strong)] text-[var(--ink)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {v.label}
          </Link>
        ))}
        <span className="ml-auto flex gap-1.5">
          {counts.critical > 0 ? (
            <Badge tone="danger">{counts.critical} critical</Badge>
          ) : null}
          <Badge tone={counts.open ? "warn" : "neutral"}>{counts.open} open</Badge>
          <Badge tone="neutral">{counts.dispositioned} in work</Badge>
          <Badge tone="neutral">{counts.closed} closed</Badge>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <DataTable
            empty={
              view === "active"
                ? "Nothing unresolved. Report an issue when hardware does not match intent."
                : "No issues in this view."
            }
            headers={["Issue", "Severity", "Status", "Title", "On", "Reported"]}
            rows={issues.map((i) => [
              <Link
                key="k"
                className="font-mono text-xs underline"
                href={`/issues/${i.id}`}
              >
                {i.key}
              </Link>,
              <Badge key="s" tone={severityTone(i.severity)}>
                {i.severity}
              </Badge>,
              <Badge key="st" tone={issueStatusTone(i.status)}>
                {i.status === "dispositioned"
                  ? i.disposition.replaceAll("_", " ")
                  : i.status}
              </Badge>,
              i.title,
              <IssueSubject key="o" issue={i} />,
              <span key="r" className="text-xs text-[var(--muted)]">
                {i.reportedBy} · {formatWhen(i.createdAt)}
              </span>,
            ])}
          />
        </Panel>

        <Panel>
          <h2 className="font-display">Report issue</h2>
          <CreateIssueForm
            defaults={{
              articleId: sp.articleId,
              runId: sp.runId,
              partRevisionId: sp.partRevisionId,
              lotId: sp.lotId,
            }}
            articles={articles.map((a) => ({
              id: a.id,
              label: `${a.serial} — ${a.name}`,
            }))}
            runs={runs.map((r) => ({ id: r.id, label: r.key }))}
            partRevs={partRevs.map((p) => ({ id: p.id, label: revLabel[p.id] }))}
            lots={lots.map((l) => ({
              id: l.id,
              label: `${l.lotCode || "(no code)"} · ${revLabel[l.partRevisionId] ?? ""}`,
            }))}
          />
        </Panel>
      </div>
    </AppShell>
  );
}
