"use client";

import { useActionState } from "react";
import {
  closeIssueAction,
  createIssueAction,
  dispositionIssueAction,
  reopenIssueAction,
  type ActionState,
} from "../lib/actions";
import { buttonClass, inputClass, subtleButtonClass } from "./ui";
import { IdentityField } from "./identity";

const initialState: ActionState = { ok: false, error: "" };

type Option = { id: string; label: string };

function ActionError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return <p className="msg-error">{state.error}</p>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

export function CreateIssueForm({
  articles,
  partRevs,
  lots,
  runs,
  defaults,
}: {
  articles: Option[];
  partRevs: Option[];
  lots: Option[];
  runs: Option[];
  defaults?: {
    articleId?: string;
    partRevisionId?: string;
    lotId?: string;
    runId?: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    createIssueAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-3">
      <Field label="What is wrong?">
        <input
          name="title"
          required
          placeholder="Valve seat scored during install"
          className={inputClass}
        />
      </Field>
      <Field label="Details">
        <textarea
          name="description"
          placeholder="What was observed, where, and how it was found"
          className={`min-h-20 ${inputClass}`}
        />
      </Field>
      <Field label="Severity">
        <select name="severity" defaultValue="minor" className={inputClass}>
          <option value="minor">Minor — cosmetic, no functional effect</option>
          <option value="major">Major — affects fit, function, or test</option>
          <option value="critical">
            Critical — safety, pressure, or wetted path
          </option>
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Article">
          <select
            name="articleId"
            defaultValue={defaults?.articleId ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {articles.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Run">
          <select
            name="runId"
            defaultValue={defaults?.runId ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {runs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Part revision">
          <select
            name="partRevisionId"
            defaultValue={defaults?.partRevisionId ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {partRevs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inventory lot">
          <select
            name="lotId"
            defaultValue={defaults?.lotId ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {lots.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Link at least one. A run fills in its article; a lot fills in its part
        revision and puts the lot on hold.
      </p>
      <Field label="Reported by">
        <IdentityField />
      </Field>
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Report issue
      </button>
    </form>
  );
}

export function DispositionForm({
  issueId,
  critical,
}: {
  issueId: string;
  critical: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    dispositionIssueAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="issueId" value={issueId} />
      <Field label="Decision">
        <select name="disposition" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            Choose…
          </option>
          <option value="use_as_is">Use as is</option>
          <option value="rework">Rework</option>
          <option value="scrap">Scrap</option>
          <option value="return_to_vendor">Return to vendor</option>
        </select>
      </Field>
      <Field label="Rationale">
        <textarea
          name="notes"
          required
          placeholder="Why this is acceptable, or what the rework is"
          className={`min-h-20 ${inputClass}`}
        />
      </Field>
      <Field label="Decided by">
        <IdentityField />
      </Field>
      {critical ? (
        <p className="text-xs text-[var(--muted)]">
          Critical: must be decided by someone other than the reporter.
        </p>
      ) : null}
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Record disposition
      </button>
    </form>
  );
}

export function CloseIssueForm({ issueId }: { issueId: string }) {
  const [state, formAction, pending] = useActionState(
    closeIssueAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="issueId" value={issueId} />
      <Field label="Closure note (optional)">
        <input
          name="notes"
          placeholder="Rework verified, re-leak-checked OK"
          className={inputClass}
        />
      </Field>
      <Field label="Closed by">
        <IdentityField />
      </Field>
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Close issue
      </button>
    </form>
  );
}

export function ReopenIssueForm({ issueId }: { issueId: string }) {
  const [state, formAction, pending] = useActionState(
    reopenIssueAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="issueId" value={issueId} />
      <Field label="Why reopen?">
        <input name="reason" required className={inputClass} />
      </Field>
      <Field label="Reopened by">
        <IdentityField />
      </Field>
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Reopen
      </button>
    </form>
  );
}
