"use client";

import { useActionState } from "react";
import {
  abortExecutionAction,
  acknowledgeRunGaps,
  approveReleaseAction,
  createRunAction,
  cutConfigFrom,
  recordStepAction,
  recordTestResult,
  releaseConfig,
  requestReleaseAction,
  returnToDraftAction,
  runLifecycleAction,
  startExecutionAction,
  waiveTest,
  type ActionState,
} from "../lib/actions";
import { buttonClass, inputClass, subtleButtonClass } from "./ui";
import { IdentityField } from "./identity";

const initialState: ActionState = { ok: false, error: "" };

function ActionError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p className="msg-error">
      {state.error}
    </p>
  );
}

export function AckGapsForm({ runId }: { runId: string }) {
  const [state, formAction, pending] = useActionState(
    acknowledgeRunGaps,
    initialState,
  );
  return (
    <form action={formAction} className="mt-4 space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <IdentityField />
      <textarea
        name="reason"
        required
        placeholder="Why proceed with gaps?"
        className={`min-h-20 ${inputClass}`}
      />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-none bg-[var(--accent-hot)] px-3.5 py-1.5 text-sm font-medium text-[var(--bg0)] disabled:opacity-50"
      >
        Acknowledge gaps &amp; proceed
      </button>
    </form>
  );
}

export function RecordTestForm({
  runId,
  missing,
}: {
  runId: string;
  missing: Array<{
    testDefinitionId: string;
    key: string;
    unit?: string;
    limitMin?: number | null;
    limitMax?: number | null;
  }>;
}) {
  const [state, formAction, pending] = useActionState(
    recordTestResult,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <select name="testDefinitionId" className={inputClass}>
        {missing.map((g) => {
          const limits =
            g.limitMin != null || g.limitMax != null
              ? ` [${g.limitMin ?? "…"}–${g.limitMax ?? "…"}${g.unit ? ` ${g.unit}` : ""}]`
              : g.unit
                ? ` (${g.unit})`
                : "";
          return (
            <option key={g.testDefinitionId} value={g.testDefinitionId}>
              {g.key}
              {limits}
            </option>
          );
        })}
      </select>
      <select name="status" className={inputClass} defaultValue="pass">
        <option value="pass">pass</option>
        <option value="fail">fail</option>
        <option value="waived">waived</option>
      </select>
      <input
        name="value"
        placeholder="Measured value (number + unit ok)"
        className={inputClass}
      />
      <p className="text-xs text-[var(--muted)]">
        If the test has limits, pass/fail is taken from the measured number.
      </p>
      <IdentityField />
      <ActionError state={state} />
      {state.ok && state.message ? (
        <p className="msg-ok">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        Save result
      </button>
    </form>
  );
}

export function NewRunForm({
  articles,
  stands,
}: {
  articles: Array<{ id: string; serial: string; name: string }>;
  stands: Array<{ id: string; key: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    createRunAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-4 space-y-3">
      <label className="block text-sm">
        Article
        <select name="articleId" className={`mt-1 ${inputClass}`}>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.serial} — {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Stand
        <select name="standId" className={`mt-1 ${inputClass}`}>
          {stands.map((st) => (
            <option key={st.id} value={st.id}>
              {st.key} — {st.name}
            </option>
          ))}
        </select>
      </label>
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        Resolve configs &amp; bind run
      </button>
    </form>
  );
}

export function RunLifecycleForm({
  runId,
  transition,
}: {
  runId: string;
  transition: "start" | "complete";
}) {
  const [state, formAction, pending] = useActionState(
    runLifecycleAction,
    initialState,
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="transition" value={transition} />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className={transition === "start" ? buttonClass : subtleButtonClass}
      >
        {transition === "start" ? "Start run" : "Complete run"}
      </button>
    </form>
  );
}

export function StartExecutionForm({
  runId,
  procedureId,
}: {
  runId: string;
  procedureId: string;
}) {
  const [state, formAction, pending] = useActionState(
    startExecutionAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="procedureId" value={procedureId} />
      <IdentityField compact />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        Start execution
      </button>
      {state.error ? (
        <span className="text-xs text-[var(--danger)]">{state.error}</span>
      ) : null}
    </form>
  );
}

export function RecordStepForm({
  runId,
  executionId,
  stepIndex,
}: {
  runId: string;
  executionId: string;
  stepIndex: number;
}) {
  const [state, formAction, pending] = useActionState(
    recordStepAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="executionId" value={executionId} />
      <input type="hidden" name="stepIndex" value={stepIndex} />
      <div className="flex gap-2">
        <select name="outcome" defaultValue="done" className={inputClass}>
          <option value="done">done</option>
          <option value="skipped">skipped</option>
          <option value="flagged">flagged</option>
        </select>
        <input
          name="value"
          placeholder="Measured value (optional)"
          className={inputClass}
        />
      </div>
      <input
        name="note"
        placeholder="Note (required for skipped/flagged)"
        className={inputClass}
      />
      <IdentityField />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        Record step {stepIndex + 1}
      </button>
    </form>
  );
}

export function AbortExecutionForm({
  runId,
  executionId,
}: {
  runId: string;
  executionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    abortExecutionAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="executionId" value={executionId} />
      <div className="flex gap-2">
        <input
          name="reason"
          required
          placeholder="Abort reason"
          className={inputClass}
        />
        <IdentityField className={`w-32 ${inputClass}`} />
      </div>
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-none border border-[color-mix(in_oklab,var(--danger)_40%,var(--line))] px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
      >
        Abort execution
      </button>
    </form>
  );
}

export function WaiverForm({
  runId,
  waivable,
}: {
  runId: string;
  waivable: Array<{ testDefinitionId: string; key: string }>;
}) {
  const [state, formAction, pending] = useActionState(waiveTest, initialState);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <select name="testDefinitionId" className={inputClass}>
        {waivable.map((g) => (
          <option key={g.testDefinitionId} value={g.testDefinitionId}>
            {g.key}
          </option>
        ))}
      </select>
      <input
        name="reason"
        required
        placeholder="Waiver reason"
        className={inputClass}
      />
      <IdentityField name="approvedBy" placeholder="Approved by" />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className={subtleButtonClass}
      >
        Record waiver
      </button>
    </form>
  );
}

function SupersedeChoice({ hasBase }: { hasBase: boolean }) {
  if (!hasBase) return null;
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="supersedeBase" className="mt-0.5" />
      <span>
        Supersede the base config
        <span className="block text-xs text-[var(--muted)]">
          Leave unchecked to keep the parent live — a 70 N variant does not
          retire 50 N. Check only when this cut replaces the parent
          everywhere. Partition effectivity so they don&apos;t overlap.
        </span>
      </span>
    </label>
  );
}

export function ReleaseConfigForm({
  configId,
  hasBase,
}: {
  configId: string;
  hasBase: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    releaseConfig,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="configId" value={configId} />
      <IdentityField placeholder="Released by" />
      <SupersedeChoice hasBase={hasBase} />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        Release config
      </button>
    </form>
  );
}

export function RequestReleaseForm({ configId }: { configId: string }) {
  const [state, formAction, pending] = useActionState(
    requestReleaseAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="configId" value={configId} />
      <IdentityField placeholder="Requested by" />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        Request release
      </button>
    </form>
  );
}

export function ApproveReleaseForm({
  configId,
  requestedBy,
  hasBase,
}: {
  configId: string;
  requestedBy: string;
  hasBase: boolean;
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveReleaseAction,
    initialState,
  );
  const [returnState, returnAction, returnPending] = useActionState(
    returnToDraftAction,
    initialState,
  );
  return (
    <div className="mt-3 space-y-3">
      <form action={approveAction} className="space-y-2">
        <input type="hidden" name="configId" value={configId} />
        <IdentityField
          name="reviewer"
          placeholder={`Reviewer (not ${requestedBy})`}
        />
        <SupersedeChoice hasBase={hasBase} />
        <ActionError state={approveState} />
        <button
          type="submit"
          disabled={approvePending}
          className={buttonClass}
        >
          Approve &amp; release
        </button>
      </form>
      <form action={returnAction}>
        <input type="hidden" name="configId" value={configId} />
        <ActionError state={returnState} />
        <button
          type="submit"
          disabled={returnPending}
          className="text-sm text-[var(--muted)] underline-offset-2 hover:underline disabled:opacity-60"
        >
          Return to draft
        </button>
      </form>
    </div>
  );
}

export function CutConfigForm({
  configs,
  defaultBasedOnId,
}: {
  configs: Array<{
    id: string;
    key: string;
    kind: string;
    program?: string;
    envelope?: string;
  }>;
  defaultBasedOnId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    cutConfigFrom,
    initialState,
  );
  return (
    <form action={formAction} className="mt-4 space-y-3">
      <label className="block text-sm">
        Based on
        <select
          name="basedOnId"
          className={`mt-1 ${inputClass}`}
          defaultValue={defaultBasedOnId}
        >
          {configs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.key} ({c.kind})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Key
        <input
          name="key"
          required
          placeholder="Key"
          className={`mt-1 font-mono ${inputClass}`}
        />
      </label>
      <label className="block text-sm">
        Name
        <input
          name="name"
          required
          placeholder="Name"
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <input
        name="program"
        placeholder="Program (blank = inherit)"
        className={inputClass}
      />
      <input
        name="envelope"
        placeholder="Envelope (blank = inherit)"
        className={inputClass}
      />
      <label className="block text-sm">
        Risk class
        <select name="riskClass" className={`mt-1 ${inputClass}`} defaultValue="R2">
          {["R0", "R1", "R2", "R3"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="applyLatestRevs"
          defaultChecked
          className="mt-0.5"
        />
        <span>
          Apply newer part revisions
          <span className="block text-xs text-[var(--muted)]">
            Pins that have a later catalog rev are swapped. Uncheck to copy
            pins exactly.
          </span>
        </span>
      </label>
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        Create draft
      </button>
    </form>
  );
}
