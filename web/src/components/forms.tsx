"use client";

import { useActionState } from "react";
import {
  acknowledgeRunGaps,
  approveReleaseAction,
  createRunAction,
  cutConfigFrom,
  recordTestResult,
  releaseConfig,
  requestReleaseAction,
  returnToDraftAction,
  runLifecycleAction,
  waiveTest,
  type ActionState,
} from "../lib/actions";

const initialState: ActionState = { ok: false, error: "" };

const inputClass =
  "w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm";

function ActionError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-950">
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
      <input name="by" defaultValue="m.chen" className={inputClass} />
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
        className="rounded-md bg-[var(--accent-hot)] px-4 py-2 text-sm text-white disabled:opacity-60"
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
  missing: Array<{ testDefinitionId: string; key: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    recordTestResult,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <select name="testDefinitionId" className={inputClass}>
        {missing.map((g) => (
          <option key={g.testDefinitionId} value={g.testDefinitionId}>
            {g.key}
          </option>
        ))}
      </select>
      <select name="status" className={inputClass} defaultValue="pass">
        <option value="pass">pass</option>
        <option value="fail">fail</option>
        <option value="waived">waived</option>
      </select>
      <input
        name="value"
        placeholder="Measured value / notes"
        className={inputClass}
      />
      <input name="by" defaultValue="tech.lee" className={inputClass} />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60"
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
        className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60"
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
        className={
          transition === "start"
            ? "rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60"
            : "rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
        }
      >
        {transition === "start" ? "Start run" : "Complete run"}
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
      <input
        name="approvedBy"
        required
        placeholder="Approved by"
        className={inputClass}
      />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
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
      <input
        type="checkbox"
        name="supersedeBase"
        defaultChecked
        className="mt-0.5"
      />
      <span>
        Supersede the base config
        <span className="block text-xs text-[var(--muted)]">
          Uncheck for a partial cut-in — the base stays live for serials this
          config doesn&apos;t cover. Keep effectivities from overlapping.
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
      <input
        name="by"
        placeholder="Released by"
        defaultValue="m.chen"
        className={inputClass}
      />
      <SupersedeChoice hasBase={hasBase} />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60"
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
      <input
        name="by"
        placeholder="Requested by"
        defaultValue="m.chen"
        className={inputClass}
      />
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60"
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
        <input
          name="reviewer"
          required
          placeholder={`Reviewer (not ${requestedBy})`}
          className={inputClass}
        />
        <SupersedeChoice hasBase={hasBase} />
        <ActionError state={approveState} />
        <button
          type="submit"
          disabled={approvePending}
          className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60"
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
  configs: Array<{ id: string; key: string; kind: string }>;
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
          placeholder="CH4-FEED-N+2"
          className={`mt-1 font-mono ${inputClass}`}
        />
      </label>
      <label className="block text-sm">
        Name
        <input
          name="name"
          required
          placeholder="Next overnight cut"
          className={`mt-1 ${inputClass}`}
        />
      </label>
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
      <ActionError state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60"
      >
        Create draft
      </button>
    </form>
  );
}
