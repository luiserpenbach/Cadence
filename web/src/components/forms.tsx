"use client";

import { useActionState } from "react";
import {
  acknowledgeRunGaps,
  cutConfigFrom,
  recordTestResult,
  releaseConfig,
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

export function ReleaseConfigForm({
  configId,
  riskClass,
}: {
  configId: string;
  riskClass: string;
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
      {riskClass === "R3" ? (
        <input
          name="reviewer"
          placeholder="Reviewer (not the releaser)"
          required
          className={inputClass}
        />
      ) : null}
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
