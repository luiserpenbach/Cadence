import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";

export type IssueResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type IssueInput = {
  title: string;
  description?: string;
  severity: string;
  reportedBy: string;
  articleId?: string | null;
  partRevisionId?: string | null;
  lotId?: string | null;
  runId?: string | null;
};

export const dispositionLabels: Record<s.IssueDisposition, string> = {
  use_as_is: "Use as is",
  rework: "Rework",
  scrap: "Scrap",
  return_to_vendor: "Return to vendor",
};

function nextIssueKey(db: DbOrTx): string {
  const rows = db.select({ key: s.issues.key }).from(s.issues).all();
  let max = 0;
  for (const r of rows) {
    const n = Number(/^ISS-(\d+)$/.exec(r.key)?.[1] ?? 0);
    if (n > max) max = n;
  }
  return `ISS-${String(max + 1).padStart(4, "0")}`;
}

// An issue must point at real hardware. A run implies its article and a lot
// implies its part revision, so the reporter only has to name what they are
// standing in front of.
export function createIssue(
  db: Db,
  input: IssueInput,
): IssueResult<{ issueId: string; key: string }> {
  const title = input.title.trim();
  const reportedBy = input.reportedBy.trim();
  if (!title) return { ok: false, error: "Describe the issue in a title." };
  if (!reportedBy) return { ok: false, error: "Reporter name is required." };
  if (!(s.issueSeverities as readonly string[]).includes(input.severity)) {
    return { ok: false, error: "Severity must be minor, major, or critical." };
  }

  let articleId = input.articleId || null;
  let partRevisionId = input.partRevisionId || null;
  const lotId = input.lotId || null;
  const runId = input.runId || null;

  if (runId) {
    const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
    if (!run) return { ok: false, error: "Run not found." };
    if (articleId && articleId !== run.articleId) {
      return { ok: false, error: "That run was not on the selected article." };
    }
    articleId = run.articleId;
  }
  if (lotId) {
    const lot = db
      .select()
      .from(s.inventoryLots)
      .where(eq(s.inventoryLots.id, lotId))
      .get();
    if (!lot) return { ok: false, error: "Inventory lot not found." };
    if (partRevisionId && partRevisionId !== lot.partRevisionId) {
      return {
        ok: false,
        error: "That lot is a different part revision than the one selected.",
      };
    }
    partRevisionId = lot.partRevisionId;
  }
  if (articleId) {
    const article = db
      .select({ id: s.articles.id })
      .from(s.articles)
      .where(eq(s.articles.id, articleId))
      .get();
    if (!article) return { ok: false, error: "Article not found." };
  }
  if (partRevisionId) {
    const rev = db
      .select({ id: s.partRevisions.id })
      .from(s.partRevisions)
      .where(eq(s.partRevisions.id, partRevisionId))
      .get();
    if (!rev) return { ok: false, error: "Part revision not found." };
  }
  if (!articleId && !partRevisionId) {
    return {
      ok: false,
      error: "Link the issue to an article, a part revision, a lot, or a run.",
    };
  }

  const issueId = id("iss");
  const key = db.transaction((tx) => {
    const k = nextIssueKey(tx);
    tx.insert(s.issues)
      .values({
        id: issueId,
        key: k,
        title,
        description: (input.description ?? "").trim(),
        severity: input.severity,
        reportedBy,
        articleId,
        partRevisionId,
        lotId,
        runId,
      })
      .run();
    return k;
  });
  return { ok: true, issueId, key };
}

// Disposition is the engineering decision. Critical issues need a second
// person: whoever reported it cannot also decide it is fine.
export function dispositionIssue(
  db: Db,
  input: { issueId: string; disposition: string; notes: string; by: string },
): IssueResult {
  const issue = db
    .select()
    .from(s.issues)
    .where(eq(s.issues.id, input.issueId))
    .get();
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.status !== "open") {
    return { ok: false, error: `${issue.key} already has a disposition.` };
  }
  const by = input.by.trim();
  const notes = input.notes.trim();
  if (!by) return { ok: false, error: "Name is required to disposition." };
  if (!(s.issueDispositions as readonly string[]).includes(input.disposition)) {
    return { ok: false, error: "Choose a disposition." };
  }
  if (!notes) {
    return { ok: false, error: "Record the rationale for this disposition." };
  }
  if (
    issue.severity === "critical" &&
    by.toLowerCase() === issue.reportedBy.trim().toLowerCase()
  ) {
    return {
      ok: false,
      error:
        "Critical issues need a second person — the reporter cannot disposition their own issue.",
    };
  }

  db.update(s.issues)
    .set({
      status: "dispositioned",
      disposition: input.disposition,
      dispositionNotes: notes,
      dispositionBy: by,
      dispositionAt: new Date().toISOString(),
    })
    .where(eq(s.issues.id, issue.id))
    .run();
  return { ok: true };
}

// Closing confirms the disposition was carried out (rework verified, part
// scrapped, RMA shipped).
export function closeIssue(
  db: Db,
  input: { issueId: string; by: string; notes?: string },
): IssueResult {
  const issue = db
    .select()
    .from(s.issues)
    .where(eq(s.issues.id, input.issueId))
    .get();
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.status === "closed") {
    return { ok: false, error: `${issue.key} is already closed.` };
  }
  if (issue.status !== "dispositioned") {
    return { ok: false, error: "Record a disposition before closing." };
  }
  const by = input.by.trim();
  if (!by) return { ok: false, error: "Name is required to close." };

  db.update(s.issues)
    .set({
      status: "closed",
      closedBy: by,
      closedAt: new Date().toISOString(),
      closeNotes: (input.notes ?? "").trim(),
    })
    .where(eq(s.issues.id, issue.id))
    .run();
  return { ok: true };
}

// Reopening clears the decision but keeps who made it in the notes, so the
// history of a reversed disposition is not lost.
export function reopenIssue(
  db: Db,
  input: { issueId: string; by: string; reason: string },
): IssueResult {
  const issue = db
    .select()
    .from(s.issues)
    .where(eq(s.issues.id, input.issueId))
    .get();
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.status === "open") {
    return { ok: false, error: `${issue.key} is already open.` };
  }
  const by = input.by.trim();
  const reason = input.reason.trim();
  if (!by || !reason) {
    return { ok: false, error: "Name and reason are required to reopen." };
  }
  const prior = issue.disposition
    ? `Previously ${dispositionLabels[issue.disposition as s.IssueDisposition] ?? issue.disposition} by ${issue.dispositionBy ?? "?"}: ${issue.dispositionNotes}`
    : "";
  const trail = [
    issue.description,
    `— Reopened by ${by}: ${reason}${prior ? ` (${prior})` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  db.update(s.issues)
    .set({
      status: "open",
      description: trail,
      disposition: "",
      dispositionNotes: "",
      dispositionBy: null,
      dispositionAt: null,
      closedBy: null,
      closedAt: null,
      closeNotes: "",
    })
    .where(eq(s.issues.id, issue.id))
    .run();
  return { ok: true };
}

export type IssueRow = {
  id: string;
  key: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  disposition: string;
  reportedBy: string;
  createdAt: string;
  articleId: string | null;
  articleSerial: string | null;
  partRevisionId: string | null;
  partNumber: string | null;
  revision: string | null;
  lotId: string | null;
  lotCode: string | null;
  runId: string | null;
  runKey: string | null;
};

const severityRank: Record<string, number> = { critical: 0, major: 1, minor: 2 };

function selectIssues(db: Db) {
  return db
    .select({
      id: s.issues.id,
      key: s.issues.key,
      title: s.issues.title,
      description: s.issues.description,
      severity: s.issues.severity,
      status: s.issues.status,
      disposition: s.issues.disposition,
      reportedBy: s.issues.reportedBy,
      createdAt: s.issues.createdAt,
      articleId: s.issues.articleId,
      articleSerial: s.articles.serial,
      partRevisionId: s.issues.partRevisionId,
      partNumber: s.parts.partNumber,
      revision: s.partRevisions.revision,
      lotId: s.issues.lotId,
      lotCode: s.inventoryLots.lotCode,
      runId: s.issues.runId,
      runKey: s.runs.key,
    })
    .from(s.issues)
    .leftJoin(s.articles, eq(s.issues.articleId, s.articles.id))
    .leftJoin(s.partRevisions, eq(s.issues.partRevisionId, s.partRevisions.id))
    .leftJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
    .leftJoin(s.inventoryLots, eq(s.issues.lotId, s.inventoryLots.id))
    .leftJoin(s.runs, eq(s.issues.runId, s.runs.id));
}

function bySeverity(rows: IssueRow[]): IssueRow[] {
  return rows.sort(
    (a, b) =>
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.key.localeCompare(a.key),
  );
}

export function listIssues(
  db: Db,
  filter: { status?: "active" | "all" | s.IssueStatus } = {},
): IssueRow[] {
  const status = filter.status ?? "active";
  const q = selectIssues(db);
  const rows =
    status === "all"
      ? q.orderBy(desc(s.issues.createdAt)).all()
      : status === "active"
        ? q.where(ne(s.issues.status, "closed")).all()
        : q.where(eq(s.issues.status, status)).all();
  return bySeverity(rows);
}

export function getIssue(db: Db, issueId: string): IssueRow | undefined {
  return selectIssues(db).where(eq(s.issues.id, issueId)).get();
}

// Issues that have not been closed out against any of the given hardware.
// "Unresolved" means open or dispositioned-but-not-closed: a rework that has
// been decided but not verified is still a reason to stop and look.
export function unresolvedIssuesFor(
  db: Db,
  scope: {
    articleId?: string | null;
    runId?: string | null;
    lotIds?: string[];
    partRevisionIds?: string[];
  },
): IssueRow[] {
  const conds = [];
  if (scope.articleId) conds.push(eq(s.issues.articleId, scope.articleId));
  if (scope.runId) conds.push(eq(s.issues.runId, scope.runId));
  if (scope.lotIds?.length) conds.push(inArray(s.issues.lotId, scope.lotIds));
  if (scope.partRevisionIds?.length) {
    conds.push(inArray(s.issues.partRevisionId, scope.partRevisionIds));
  }
  if (conds.length === 0) return [];
  const rows = selectIssues(db)
    .where(and(ne(s.issues.status, "closed"), or(...conds)))
    .all();
  return bySeverity(rows);
}

// Everything unresolved that bears on a run: issues on the article, on the
// run itself, and on the specific lots installed on the article as-built.
export function unresolvedIssuesForRun(db: Db, runId: string): IssueRow[] {
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
  if (!run) return [];
  const lotIds = db
    .select({ lotId: s.asBuiltLines.lotId })
    .from(s.asBuiltLines)
    .where(eq(s.asBuiltLines.articleId, run.articleId))
    .all()
    .map((r) => r.lotId)
    .filter((v): v is string => Boolean(v));
  return unresolvedIssuesFor(db, {
    articleId: run.articleId,
    runId,
    lotIds: [...new Set(lotIds)],
  });
}

// Lot ids that should be treated as on hold: any issue on the lot that has
// not been closed.
export function lotsOnHold(db: Db): Map<string, IssueRow[]> {
  const rows = selectIssues(db)
    .where(and(ne(s.issues.status, "closed"), sql`${s.issues.lotId} is not null`))
    .all();
  const map = new Map<string, IssueRow[]>();
  for (const r of rows) {
    if (!r.lotId) continue;
    map.set(r.lotId, [...(map.get(r.lotId) ?? []), r]);
  }
  return map;
}

export function issueCounts(db: Db) {
  const rows = db
    .select({ status: s.issues.status, severity: s.issues.severity })
    .from(s.issues)
    .all();
  const active = rows.filter((r) => r.status !== "closed");
  return {
    open: rows.filter((r) => r.status === "open").length,
    dispositioned: rows.filter((r) => r.status === "dispositioned").length,
    closed: rows.filter((r) => r.status === "closed").length,
    critical: active.filter((r) => r.severity === "critical").length,
  };
}
