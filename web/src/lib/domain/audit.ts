import { createHash } from "node:crypto";
import { asc, desc, eq, like, or, and } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";

export type AuditEvent = typeof s.auditEvents.$inferSelect;

function hashEvent(
  prevHash: string,
  e: { at: string; actor: string; action: string; summary: string; refs: string },
) {
  return createHash("sha256")
    .update(
      JSON.stringify([prevHash, e.at, e.actor, e.action, e.summary, e.refs]),
    )
    .digest("hex");
}

// Appends one event, chained to the previous event's hash. Runs in a
// transaction so two writers cannot fork the chain.
export function recordAudit(
  db: Db,
  input: {
    actor: string;
    action: string;
    summary: string;
    refs?: string[];
    at?: string;
  },
): AuditEvent {
  const refs = [...new Set(input.refs ?? [])].filter(Boolean);
  const event = {
    at: input.at ?? new Date().toISOString(),
    actor: input.actor.trim(),
    action: input.action,
    summary: input.summary,
    refs: refs.length ? ` ${refs.join(" ")} ` : "",
  };
  return db.transaction((tx) => {
    const last = tx
      .select({ hash: s.auditEvents.hash })
      .from(s.auditEvents)
      .orderBy(desc(s.auditEvents.seq))
      .limit(1)
      .get();
    const prevHash = last?.hash ?? "";
    return tx
      .insert(s.auditEvents)
      .values({ ...event, prevHash, hash: hashEvent(prevHash, event) })
      .returning()
      .get();
  });
}

export type ChainStatus =
  | { ok: true; count: number }
  | { ok: false; count: number; brokenAtSeq: number };

// Recomputes every hash from the first event. Any edited, removed, or
// reordered row breaks the chain at that point.
export function verifyAuditChain(db: Db): ChainStatus {
  const rows = db
    .select()
    .from(s.auditEvents)
    .orderBy(asc(s.auditEvents.seq))
    .all();
  let prev = "";
  for (const row of rows) {
    if (row.prevHash !== prev || row.hash !== hashEvent(prev, row)) {
      return { ok: false, count: rows.length, brokenAtSeq: row.seq };
    }
    prev = row.hash;
  }
  return { ok: true, count: rows.length };
}

export function listAudit(
  db: Db,
  filter: { ref?: string; q?: string; limit?: number } = {},
): AuditEvent[] {
  const conds = [];
  if (filter.ref) conds.push(like(s.auditEvents.refs, `% ${filter.ref} %`));
  const q = filter.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(
      or(
        like(s.auditEvents.actor, pattern),
        like(s.auditEvents.summary, pattern),
        like(s.auditEvents.action, pattern),
      ),
    );
  }
  return db
    .select()
    .from(s.auditEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(s.auditEvents.seq))
    .limit(filter.limit ?? 200)
    .all();
}

const ID_PATTERN = /\b([a-z]+)_[A-Za-z0-9_-]{10}\b/g;

export function extractIds(text: string): string[] {
  return [...new Set(text.match(ID_PATTERN) ?? [])];
}

// Turns a record id into the name a person would recognize. Unknown or
// deleted records return null and are simply left out of the summary.
export function describeRef(db: Db, ref: string): string | null {
  const prefix = ref.slice(0, ref.indexOf("_"));
  switch (prefix) {
    case "cfg":
      return (
        db
          .select({ v: s.configurations.key })
          .from(s.configurations)
          .where(eq(s.configurations.id, ref))
          .get()?.v ?? null
      );
    case "run":
      return (
        db.select({ v: s.runs.key }).from(s.runs).where(eq(s.runs.id, ref)).get()
          ?.v ?? null
      );
    case "art":
      return (
        db
          .select({ v: s.articles.serial })
          .from(s.articles)
          .where(eq(s.articles.id, ref))
          .get()?.v ?? null
      );
    case "stand":
      return (
        db
          .select({ v: s.stands.key })
          .from(s.stands)
          .where(eq(s.stands.id, ref))
          .get()?.v ?? null
      );
    case "part":
      return (
        db
          .select({ v: s.parts.partNumber })
          .from(s.parts)
          .where(eq(s.parts.id, ref))
          .get()?.v ?? null
      );
    case "rev": {
      const r = db
        .select({ pn: s.parts.partNumber, rev: s.partRevisions.revision })
        .from(s.partRevisions)
        .innerJoin(s.parts, eq(s.partRevisions.partId, s.parts.id))
        .where(eq(s.partRevisions.id, ref))
        .get();
      return r ? `${r.pn} @ ${r.rev}` : null;
    }
    case "kit":
      return (
        db.select({ v: s.kits.key }).from(s.kits).where(eq(s.kits.id, ref)).get()
          ?.v ?? null
      );
    case "po":
      return (
        db
          .select({ v: s.purchaseOrders.poNumber })
          .from(s.purchaseOrders)
          .where(eq(s.purchaseOrders.id, ref))
          .get()?.v ?? null
      );
    case "wo":
      return (
        db
          .select({ v: s.workOrders.key })
          .from(s.workOrders)
          .where(eq(s.workOrders.id, ref))
          .get()?.v ?? null
      );
    case "inv": {
      const r = db
        .select({ v: s.inventoryLots.lotCode })
        .from(s.inventoryLots)
        .where(eq(s.inventoryLots.id, ref))
        .get();
      return r ? `lot ${r.v || "(no code)"}` : null;
    }
    case "proc": {
      const r = db
        .select({ key: s.procedures.key, version: s.procedures.version })
        .from(s.procedures)
        .where(eq(s.procedures.id, ref))
        .get();
      return r ? `${r.key} v${r.version}` : null;
    }
    case "tdef":
      return (
        db
          .select({ v: s.testDefinitions.key })
          .from(s.testDefinitions)
          .where(eq(s.testDefinitions.id, ref))
          .get()?.v ?? null
      );
    case "iss":
      return (
        db
          .select({ v: s.issues.key })
          .from(s.issues)
          .where(eq(s.issues.id, ref))
          .get()?.v ?? null
      );
    default:
      return null;
  }
}

// Server-action names → what a person would call the action.
const ACTION_LABELS: Record<string, string> = {
  acknowledgeRunGaps: "Acknowledged verification gaps",
  waiveTest: "Waived test",
  recordTestResult: "Recorded test result",
  createRunAction: "Created run",
  runLifecycleAction: "Changed run state",
  releaseConfig: "Released config",
  requestReleaseAction: "Requested release review",
  approveReleaseAction: "Approved release",
  returnToDraftAction: "Returned config to draft",
  cutInRevisionAction: "Cut in part revision",
  createPartAction: "Created part",
  deletePartsAction: "Deleted parts",
  saveCatalogSettingsAction: "Saved catalog settings",
  addLinkAttachmentAction: "Attached link",
  uploadFileAttachmentAction: "Uploaded file",
  removeAttachmentAction: "Removed attachment",
  addPartRevisionAction: "Added part revision",
  createArticleAction: "Created article",
  createStandAction: "Created stand",
  createConfigAction: "Created config",
  recordAsBuiltAction: "Recorded as-built",
  startExecutionAction: "Started procedure",
  recordStepAction: "Recorded procedure step",
  abortExecutionAction: "Aborted procedure",
  createProcedureAction: "Created procedure",
  reviseProcedureAction: "Revised procedure",
  createTestDefinitionAction: "Created test definition",
  configEditAction: "Edited draft config",
  cutConfigFrom: "Cut new config",
  reverseAsBuiltAction: "Reversed as-built",
  updatePartAction: "Updated part",
  createLotAction: "Received lot",
  adjustLotAction: "Adjusted lot",
  createPoAction: "Created PO",
  addPoLineAction: "Added PO line",
  markPoOrderedAction: "Marked PO ordered",
  receivePoAction: "Received PO",
  openShortagePoAction: "Opened shortage PO",
  createKitAction: "Created kit",
  allocateKitLineAction: "Allocated kit line",
  unallocateKitLineAction: "Unallocated kit line",
  allocateRemainingAction: "Allocated remaining kit lines",
  issueKitAction: "Issued kit",
  cancelKitAction: "Cancelled kit",
  importBomCsvAction: "Imported BoM CSV",
  importCatalogCsvAction: "Imported catalog CSV",
  createWorkOrderAction: "Created work order",
  completeWorkOrderAction: "Completed work order",
  cancelWorkOrderAction: "Cancelled work order",
  openShortageWoAction: "Opened shortage work orders",
  createAndPinTestAction: "Created and pinned test",
  createAndPinProcedureAction: "Created and pinned procedure",
  createIssueAction: "Reported issue",
  dispositionIssueAction: "Dispositioned issue",
  closeIssueAction: "Closed issue",
  reopenIssueAction: "Reopened issue",
};

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const words = action
    .replace(/Action$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Short free-text fields worth quoting in the summary. Anything else a form
// carries (notes, bodies, files) stays out of the log.
const SALIENT_FIELDS = [
  "key",
  "partNumber",
  "serial",
  "poNumber",
  "title",
  "name",
  "revision",
  "intent",
  "op",
  "transition",
  "status",
  "disposition",
  "severity",
  "qty",
  "delta",
  "lotCode",
  "supplier",
  "reason",
] as const;

// Builds the human summary and the touched-record list for one action from
// the submitted fields (and, for redirects, the destination URL).
export function summarizeAction(
  db: Db,
  action: string,
  fields: Record<string, string>,
  extraText = "",
): { summary: string; refs: string[] } {
  const refs = extractIds(`${Object.values(fields).join(" ")} ${extraText}`);
  const names = refs
    .map((r) => describeRef(db, r))
    .filter((v): v is string => Boolean(v));
  const details: string[] = [];
  for (const f of SALIENT_FIELDS) {
    const v = fields[f]?.trim();
    if (!v || extractIds(v).length) continue;
    if (names.includes(v)) continue;
    const short = v.length > 80 ? `${v.slice(0, 77)}…` : v;
    details.push(f === "key" || f === "title" || f === "name" ? short : `${f} ${short}`);
  }
  const parts = [actionLabel(action), [...new Set(names)].join(", "), details.join(" · ")];
  return { summary: parts.filter(Boolean).join(" — "), refs };
}
