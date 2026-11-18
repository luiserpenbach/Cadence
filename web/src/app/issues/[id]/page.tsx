import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell, Badge, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { dispositionLabels, getIssue } from "../../../lib/domain/issues";
import {
  CloseIssueForm,
  DispositionForm,
  ReopenIssueForm,
} from "../../../components/issue-forms";
import {
  ActivityPanel,
  IssueSubject,
  formatWhen,
  issueStatusTone,
  severityTone,
} from "../../../components/issues-ui";

export const dynamic = "force-dynamic";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureAppData();
  const { id } = await params;
  const db = getDb();
  const issue = getIssue(db, id);
  if (!issue) notFound();
  const full = db.select().from(s.issues).where(eq(s.issues.id, id)).get()!;

  return (
    <AppShell title={`${issue.key} · ${issue.title}`}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
        <Badge tone={issueStatusTone(issue.status)}>{issue.status}</Badge>
        <IssueSubject issue={issue} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel>
            <h2 className="font-display">Report</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm">
              {issue.description || (
                <span className="text-[var(--muted)]">No details recorded.</span>
              )}
            </p>
            <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
              Reported by {issue.reportedBy} · {formatWhen(issue.createdAt)}
            </p>
          </Panel>

          {full.disposition ? (
            <Panel>
              <h2 className="font-display">Disposition</h2>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone="accent">
                  {dispositionLabels[full.disposition as s.IssueDisposition] ??
                    full.disposition}
                </Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {full.dispositionNotes}
              </p>
              <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
                Decided by {full.dispositionBy} ·{" "}
                {formatWhen(full.dispositionAt ?? "")}
              </p>
              {full.status === "closed" ? (
                <p className="mt-3 border-t border-[var(--line-soft)] pt-3 text-sm">
                  Closed by {full.closedBy} · {formatWhen(full.closedAt ?? "")}
                  {full.closeNotes ? ` — ${full.closeNotes}` : ""}
                </p>
              ) : null}
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          {issue.status === "open" ? (
            <Panel>
              <h2 className="font-display">Disposition</h2>
              <DispositionForm
                issueId={issue.id}
                critical={issue.severity === "critical"}
              />
            </Panel>
          ) : null}
          {issue.status === "dispositioned" ? (
            <Panel>
              <h2 className="font-display">Close out</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Confirm the disposition was carried out. Until then this issue
                keeps warning.
              </p>
              <CloseIssueForm issueId={issue.id} />
            </Panel>
          ) : null}
          {issue.status !== "open" ? (
            <Panel>
              <h2 className="font-display">Reopen</h2>
              <ReopenIssueForm issueId={issue.id} />
            </Panel>
          ) : null}
          <ActivityPanel refId={issue.id} />
        </div>
      </div>
    </AppShell>
  );
}
