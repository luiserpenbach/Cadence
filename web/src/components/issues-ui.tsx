import Link from "next/link";
import { getDb } from "../db";
import { listAudit } from "../lib/domain/audit";
import type { IssueRow } from "../lib/domain/issues";
import { Badge, Panel } from "./ui";

export function severityTone(severity: string) {
  return severity === "critical"
    ? ("danger" as const)
    : severity === "major"
      ? ("warn" as const)
      : ("neutral" as const);
}

export function issueStatusTone(status: string) {
  return status === "closed"
    ? ("ok" as const)
    : status === "dispositioned"
      ? ("accent" as const)
      : ("warn" as const);
}

export function IssueSubject({ issue }: { issue: IssueRow }) {
  const bits: React.ReactNode[] = [];
  if (issue.articleId) {
    bits.push(
      <Link key="a" className="underline" href={`/articles/${issue.articleId}`}>
        {issue.articleSerial}
      </Link>,
    );
  }
  if (issue.runId) {
    bits.push(
      <Link key="r" className="underline" href={`/runs/${issue.runId}`}>
        {issue.runKey}
      </Link>,
    );
  }
  if (issue.partNumber) {
    bits.push(
      <span key="p">
        {issue.partNumber} @ {issue.revision}
      </span>,
    );
  }
  if (issue.lotId) {
    bits.push(
      <Link
        key="l"
        className="underline"
        href={`/trace?q=${encodeURIComponent(issue.lotCode ?? "")}`}
      >
        lot {issue.lotCode || "(no code)"}
      </Link>,
    );
  }
  return (
    <span className="font-mono text-xs text-[var(--muted)]">
      {bits.map((b, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {b}
        </span>
      ))}
    </span>
  );
}

export function IssueList({
  issues,
  empty = "No unresolved issues.",
}: {
  issues: IssueRow[];
  empty?: string;
}) {
  if (issues.length === 0) {
    return <p className="mt-2 text-sm text-[var(--muted)]">{empty}</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {issues.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
          <Link className="font-mono text-xs underline" href={`/issues/${i.id}`}>
            {i.key}
          </Link>
          <span>{i.title}</span>
          {i.status === "dispositioned" ? (
            <Badge tone="accent">{i.disposition.replaceAll("_", " ")}</Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// Loud-but-not-blocking banner (record-and-warn): unresolved issues on the
// hardware in front of you.
export function IssueBanner({
  issues,
  what,
}: {
  issues: IssueRow[];
  what: string;
}) {
  if (issues.length === 0) return null;
  const critical = issues.some((i) => i.severity === "critical");
  return (
    <div className={`alert ${critical ? "alert-danger" : "alert-warn"} mb-5`}>
      <div className="font-medium">
        {issues.length} unresolved {issues.length === 1 ? "issue" : "issues"} on{" "}
        {what}
      </div>
      <IssueList issues={issues} />
    </div>
  );
}

export function formatWhen(iso: string) {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

// History of one record, straight from the audit log.
export function ActivityPanel({
  refId,
  className = "",
  limit = 12,
}: {
  refId: string;
  className?: string;
  limit?: number;
}) {
  const events = listAudit(getDb(), { ref: refId, limit });
  return (
    <Panel className={className}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display">History</h2>
        <Link
          className="text-xs text-[var(--muted)] underline"
          href={`/activity?ref=${refId}`}
        >
          All
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No recorded changes yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {events.map((e) => (
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
  );
}
