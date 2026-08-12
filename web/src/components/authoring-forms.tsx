"use client";

import { useActionState, useState } from "react";
import {
  addLinkAttachmentAction,
  addPartRevisionAction,
  configEditAction,
  createArticleAction,
  createConfigAction,
  createPartAction,
  createProcedureAction,
  createStandAction,
  createTestDefinitionAction,
  cutInRevisionAction,
  recordAsBuiltAction,
  removeAttachmentAction,
  reviseProcedureAction,
  uploadFileAttachmentAction,
  type ActionState,
} from "../lib/actions";
import { PartRevPicker } from "./pickers";

const initialState: ActionState = { ok: false, error: "" };

const inputClass =
  "w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm";
const buttonClass =
  "rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)] disabled:opacity-60";
const subtleButtonClass =
  "rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60";

function ActionError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-950">
      {state.error}
    </p>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.ok || !state.message) return null;
  return (
    <p className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-950">
      {state.message}
    </p>
  );
}

export function NewPartForm() {
  const [state, formAction, pending] = useActionState(
    createPartAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input
        name="partNumber"
        required
        placeholder="Part number (VLV-CRYO-075)"
        className={`font-mono ${inputClass}`}
      />
      <input name="name" required placeholder="Name" className={inputClass} />
      <div className="flex gap-2">
        <input
          name="category"
          required
          defaultValue="hardware"
          placeholder="Category"
          className={inputClass}
        />
        <input
          name="revision"
          required
          defaultValue="A"
          placeholder="Rev"
          className={`w-24 ${inputClass}`}
        />
      </div>
      <div className="flex gap-2">
        <select name="sourcing" defaultValue="buy" className={inputClass}>
          <option value="make">make</option>
          <option value="buy">buy</option>
          <option value="cots">cots</option>
        </select>
        <select name="kind" defaultValue="component" className={inputClass}>
          <option value="component">component</option>
          <option value="assembly">assembly</option>
        </select>
      </div>
      <textarea
        name="description"
        placeholder="Description (optional)"
        className={`min-h-16 ${inputClass}`}
      />
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create part
      </button>
    </form>
  );
}

export function AttachmentForms({
  entityType,
  entityId,
}: {
  entityType: "part" | "configuration";
  entityId: string;
}) {
  const [linkState, linkAction, linkPending] = useActionState(
    addLinkAttachmentAction,
    initialState,
  );
  const [fileState, fileAction, filePending] = useActionState(
    uploadFileAttachmentAction,
    initialState,
  );
  return (
    <div className="mt-3 space-y-4">
      <form action={linkAction} className="space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <div className="flex gap-2">
          <input
            name="url"
            required
            placeholder="https://… (drawing, datasheet)"
            className={inputClass}
          />
          <input
            name="label"
            placeholder="Label"
            className={`w-36 ${inputClass}`}
          />
        </div>
        <div className="flex gap-2">
          <input
            name="by"
            defaultValue="m.chen"
            className={`w-32 ${inputClass}`}
          />
          <button
            type="submit"
            disabled={linkPending}
            className={subtleButtonClass}
          >
            Add link
          </button>
        </div>
        <ActionError state={linkState} />
      </form>

      <form action={fileAction} className="space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input
          type="file"
          name="file"
          required
          className="block w-full text-sm file:mr-2 file:rounded-md file:border file:border-[var(--line)] file:bg-white file:px-3 file:py-1.5 file:text-sm"
        />
        <div className="flex gap-2">
          <input
            name="label"
            placeholder="Label (optional)"
            className={inputClass}
          />
          <input
            name="by"
            defaultValue="m.chen"
            className={`w-32 ${inputClass}`}
          />
          <button
            type="submit"
            disabled={filePending}
            className={subtleButtonClass}
          >
            Upload
          </button>
        </div>
        <ActionError state={fileState} />
      </form>
    </div>
  );
}

export function RemoveAttachmentButton({
  attachmentId,
  entityType,
  entityId,
}: {
  attachmentId: string;
  entityType: string;
  entityId: string;
}) {
  const [state, formAction, pending] = useActionState(
    removeAttachmentAction,
    initialState,
  );
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      {state.error ? (
        <span className="mr-1 text-xs text-rose-700">{state.error}</span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-rose-700 underline-offset-2 hover:underline disabled:opacity-60"
      >
        remove
      </button>
    </form>
  );
}

export function NewRevisionForm({
  parts,
}: {
  parts: Array<{ id: string; partNumber: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    addPartRevisionAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <select name="partId" className={inputClass}>
        {parts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.partNumber}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          name="revision"
          required
          placeholder="New rev (B)"
          className={`w-24 ${inputClass}`}
        />
        <input
          name="notes"
          placeholder="What changed on the artifact?"
          className={inputClass}
        />
      </div>
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Add revision
      </button>
    </form>
  );
}

export function NewArticleForm() {
  const [state, formAction, pending] = useActionState(
    createArticleAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input
        name="serial"
        required
        placeholder="Serial (TP-019)"
        className={`font-mono ${inputClass}`}
      />
      <input name="name" required placeholder="Name" className={inputClass} />
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create article
      </button>
    </form>
  );
}

export function NewStandForm() {
  const [state, formAction, pending] = useActionState(
    createStandAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input
        name="key"
        required
        placeholder="Key (COLD-FLOW-2)"
        className={`font-mono ${inputClass}`}
      />
      <input name="name" required placeholder="Name" className={inputClass} />
      <input name="location" placeholder="Location" className={inputClass} />
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create stand
      </button>
    </form>
  );
}

export function NewConfigForm() {
  const [state, formAction, pending] = useActionState(
    createConfigAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input
        name="key"
        required
        placeholder="Key (LN2-COOL-1)"
        className={`font-mono ${inputClass}`}
      />
      <input name="name" required placeholder="Name" className={inputClass} />
      <div className="flex gap-2">
        <select name="kind" className={inputClass}>
          <option value="article">article</option>
          <option value="stand">stand</option>
        </select>
        <select name="riskClass" defaultValue="R1" className={inputClass}>
          {["R0", "R1", "R2", "R3"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create empty draft
      </button>
    </form>
  );
}

export function AsBuiltForm({
  articleId,
  partRevs,
  runs,
}: {
  articleId: string;
  partRevs: Array<{ id: string; label: string }>;
  runs: Array<{ id: string; key: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    recordAsBuiltAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="articleId" value={articleId} />
      <PartRevPicker name="partRevisionId" options={partRevs} />
      <div className="flex gap-2">
        <input
          name="qty"
          type="number"
          step="any"
          min="0"
          defaultValue="1"
          className={`w-24 ${inputClass}`}
        />
        <input
          name="serialOrLot"
          placeholder="Serial / lot"
          className={inputClass}
        />
      </div>
      <select name="runId" className={inputClass} defaultValue="">
        <option value="">No run binding</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.key}
          </option>
        ))}
      </select>
      <input name="by" defaultValue="m.chen" className={inputClass} />
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Record as-built line
      </button>
    </form>
  );
}

export function NewProcedureForm() {
  const [state, formAction, pending] = useActionState(
    createProcedureAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input
        name="key"
        required
        placeholder="Key (PROC-PURGE-1)"
        className={`font-mono ${inputClass}`}
      />
      <input name="title" required placeholder="Title" className={inputClass} />
      <textarea
        name="body"
        placeholder="Steps…"
        className={`min-h-24 ${inputClass}`}
      />
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create procedure (v A)
      </button>
    </form>
  );
}

export function ReviseProcedureForm({
  procedureId,
  title,
  body,
}: {
  procedureId: string;
  title: string;
  body: string;
}) {
  const [state, formAction, pending] = useActionState(
    reviseProcedureAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="procedureId" value={procedureId} />
      <input
        name="title"
        required
        defaultValue={title}
        className={inputClass}
      />
      <textarea
        name="body"
        defaultValue={body}
        className={`min-h-24 ${inputClass}`}
      />
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Release new version
      </button>
    </form>
  );
}

export function NewTestDefForm() {
  const [state, formAction, pending] = useActionState(
    createTestDefinitionAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input
        name="key"
        required
        placeholder="Key (TST-LEAK-N2)"
        className={`font-mono ${inputClass}`}
      />
      <input name="name" required placeholder="Name" className={inputClass} />
      <input
        name="description"
        placeholder="Description"
        className={inputClass}
      />
      <select name="appliesTo" className={inputClass}>
        <option value="article">article</option>
        <option value="stand">stand</option>
        <option value="either">either</option>
      </select>
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create test definition
      </button>
    </form>
  );
}

// One-shot rev cut-in: pick the new revision, get drafts of every released
// config that pinned an older rev of the same part.
export function CutInRevisionForm({
  partRevs,
}: {
  partRevs: Array<{ id: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    cutInRevisionAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <select name="partRevisionId" className={inputClass}>
        {partRevs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <select name="riskClass" defaultValue="R2" className={inputClass}>
        {["R0", "R1", "R2", "R3"].map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Cut in this revision
      </button>
    </form>
  );
}

// Inline editor for a draft BoM line: swap revision, adjust qty/find in place.
export function BomLineEditor({
  configId,
  bomLineId,
  revOptions,
  currentRevId,
  qty,
  findNumber,
  notes,
}: {
  configId: string;
  bomLineId: string;
  revOptions: Array<{ id: string; label: string }>;
  currentRevId: string;
  qty: number;
  findNumber: string;
  notes: string;
}) {
  const [state, formAction, pending] = useActionState(
    configEditAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="op" value="update_bom" />
      <input type="hidden" name="configId" value={configId} />
      <input type="hidden" name="bomLineId" value={bomLineId} />
      <select
        name="partRevisionId"
        defaultValue={currentRevId}
        className="max-w-56 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs"
      >
        {revOptions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        name="qty"
        type="number"
        step="any"
        min="0"
        defaultValue={qty}
        className="w-16 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs"
      />
      <input
        name="findNumber"
        defaultValue={findNumber}
        placeholder="find"
        className="w-16 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs"
      />
      <input
        name="notes"
        defaultValue={notes}
        placeholder="notes"
        className="w-28 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-60"
      >
        Save
      </button>
      {state.error ? (
        <span className="text-xs text-rose-700">{state.error}</span>
      ) : null}
    </form>
  );
}

// One-button remove for config edits (remove_bom / remove_test / ...)
export function ConfigEditButton({
  payload,
  label,
}: {
  payload: Record<string, string>;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    configEditAction,
    initialState,
  );
  return (
    <form action={formAction} className="inline">
      {Object.entries(payload).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.error ? (
        <span className="mr-2 text-xs text-rose-700">{state.error}</span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-rose-700 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {label}
      </button>
    </form>
  );
}

export function AddAlternateForm({
  configId,
  lines,
  partRevs,
}: {
  configId: string;
  lines: Array<{ id: string; label: string }>;
  partRevs: Array<{ id: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    configEditAction,
    initialState,
  );
  if (lines.length === 0) return null;
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="op" value="add_alt" />
      <input type="hidden" name="configId" value={configId} />
      <div className="flex flex-wrap gap-2">
        <select name="bomLineId" className={inputClass}>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <select name="partRevisionId" className={inputClass}>
          {partRevs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={subtleButtonClass}>
          Allow alternate
        </button>
      </div>
      <ActionError state={state} />
    </form>
  );
}

export function AddBomLineForm({
  configId,
  partRevs,
}: {
  configId: string;
  partRevs: Array<{ id: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    configEditAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="op" value="add_bom" />
      <input type="hidden" name="configId" value={configId} />
      <PartRevPicker name="partRevisionId" options={partRevs} />
      <div className="flex gap-2">
        <input
          name="qty"
          type="number"
          step="any"
          min="0"
          defaultValue="1"
          className={`w-24 ${inputClass}`}
        />
        <input
          name="findNumber"
          placeholder="Find no."
          className={`w-28 ${inputClass}`}
        />
        <input name="notes" placeholder="Notes" className={inputClass} />
        <button type="submit" disabled={pending} className={subtleButtonClass}>
          Add pin
        </button>
      </div>
      <ActionError state={state} />
    </form>
  );
}

export function AddLinkForm({
  configId,
  op,
  fieldName,
  options,
  label,
}: {
  configId: string;
  op: "add_test" | "add_proc";
  fieldName: "testDefinitionId" | "procedureId";
  options: Array<{ id: string; label: string }>;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    configEditAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="configId" value={configId} />
      <div className="flex gap-2">
        <select name={fieldName} className={inputClass}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={subtleButtonClass}>
          {label}
        </button>
      </div>
      <ActionError state={state} />
    </form>
  );
}

export function AddEffectivityForm({
  configId,
  stands,
  articles,
}: {
  configId: string;
  stands: Array<{ id: string; key: string }>;
  articles: Array<{ id: string; serial: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    configEditAction,
    initialState,
  );
  const [articleScope, setArticleScope] = useState("any");
  const [standScope, setStandScope] = useState("any");
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="op" value="add_eff" />
      <input type="hidden" name="configId" value={configId} />
      <div className="flex gap-2">
        <select
          name="articleScope"
          value={articleScope}
          onChange={(e) => setArticleScope(e.target.value)}
          className={inputClass}
        >
          <option value="any">any article</option>
          <option value="serial_range">serial range</option>
          <option value="explicit">explicit articles</option>
        </select>
        <select
          name="standScope"
          value={standScope}
          onChange={(e) => setStandScope(e.target.value)}
          className={inputClass}
        >
          <option value="any">any stand</option>
          <option value="explicit">explicit stand</option>
        </select>
      </div>
      {articleScope === "serial_range" ? (
        <div className="flex gap-2">
          <input
            name="serialFrom"
            placeholder="From (TP-014)"
            className={`font-mono ${inputClass}`}
          />
          <input
            name="serialTo"
            placeholder="To (optional)"
            className={`font-mono ${inputClass}`}
          />
        </div>
      ) : null}
      {articleScope === "explicit" ? (
        <select name="articleIds" multiple className={`min-h-24 ${inputClass}`}>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.serial}
            </option>
          ))}
        </select>
      ) : null}
      {standScope === "explicit" ? (
        <select name="standId" className={inputClass}>
          {stands.map((st) => (
            <option key={st.id} value={st.id}>
              {st.key}
            </option>
          ))}
        </select>
      ) : null}
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Add effectivity
      </button>
    </form>
  );
}
