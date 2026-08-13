"use client";

import { useActionState, useState } from "react";
import {
  addPoLineAction,
  adjustLotAction,
  allocateKitLineAction,
  allocateRemainingAction,
  cancelKitAction,
  createKitAction,
  createLotAction,
  createPoAction,
  importBomCsvAction,
  issueKitAction,
  markPoOrderedAction,
  openShortagePoAction,
  receivePoAction,
  reverseAsBuiltAction,
  unallocateKitLineAction,
  updatePartAction,
  type ActionState,
} from "../lib/actions";
import { PartRevPicker, useRefreshOnOk } from "./pickers";
import { buttonClass, compactInputClass, inputClass, subtleButtonClass } from "./ui";

const initialState: ActionState = { ok: false, error: "" };

function ActionError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p className="msg-error">
      {state.error}
    </p>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.ok || !state.message) return null;
  return (
    <p className="msg-ok">
      {state.message}
    </p>
  );
}

type PartRev = { id: string; label: string };

export function CreateLotForm({ partRevs }: { partRevs: PartRev[] }) {
  const [state, formAction, pending] = useActionState(createLotAction, initialState);
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2" data-testid="create-lot-form">
      <PartRevPicker name="partRevisionId" options={partRevs} />
      <div className="flex gap-2">
        <input name="lotCode" required placeholder="Lot code" className={`font-mono ${inputClass}`} />
        <input name="qty" type="number" step="any" min="0" defaultValue="1" className={`w-24 ${inputClass}`} />
      </div>
      <input name="location" placeholder="Location" className={inputClass} />
      <div className="flex gap-2">
        <input name="by" defaultValue="m.chen" className={`w-32 ${inputClass}`} />
        <input name="reason" placeholder="Reason (optional)" className={inputClass} />
      </div>
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create lot
      </button>
    </form>
  );
}

export function AdjustLotForm({
  lots,
}: {
  lots: Array<{ id: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(adjustLotAction, initialState);
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <select name="lotId" className={inputClass}>
        {lots.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          name="qtyDelta"
          type="number"
          step="any"
          placeholder="+/- qty"
          required
          className={`w-28 ${inputClass}`}
        />
        <input name="reason" required placeholder="Reason" className={inputClass} />
      </div>
      <input name="by" defaultValue="m.chen" className={inputClass} />
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Adjust
      </button>
    </form>
  );
}

export function CreatePoForm() {
  const [state, formAction, pending] = useActionState(createPoAction, initialState);
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input name="poNumber" required placeholder="PO number" className={`font-mono ${inputClass}`} />
      <input name="supplier" required placeholder="Supplier" className={inputClass} />
      <input name="notes" placeholder="Notes" className={inputClass} />
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Create PO
      </button>
    </form>
  );
}

export function AddPoLineForm({ poId, partRevs }: { poId: string; partRevs: PartRev[] }) {
  const [state, formAction, pending] = useActionState(addPoLineAction, initialState);
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="poId" value={poId} />
      <PartRevPicker name="partRevisionId" options={partRevs} />
      <div className="flex gap-2">
        <input name="qty" type="number" step="any" min="0" defaultValue="1" className={`w-24 ${inputClass}`} />
        <input name="unitCost" type="number" step="any" min="0" defaultValue="0" placeholder="Unit cost" className={inputClass} />
        <button type="submit" disabled={pending} className={subtleButtonClass}>
          Add line
        </button>
      </div>
      <ActionError state={state} />
    </form>
  );
}

export function PoStatusButtons({ poId, status }: { poId: string; status: string }) {
  const [orderState, orderAction, orderPending] = useActionState(
    markPoOrderedAction,
    initialState,
  );
  const [recvState, recvAction, recvPending] = useActionState(
    receivePoAction,
    initialState,
  );
  useRefreshOnOk(orderState);
  useRefreshOnOk(recvState);
  return (
    <div className="mt-3 space-y-2">
      {status === "open" ? (
        <form action={orderAction}>
          <input type="hidden" name="poId" value={poId} />
          <ActionError state={orderState} />
          <button type="submit" disabled={orderPending} className={subtleButtonClass}>
            Mark ordered
          </button>
        </form>
      ) : null}
      {status !== "received" ? (
        <form action={recvAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="poId" value={poId} />
          <input name="by" defaultValue="m.chen" className={`w-32 ${inputClass}`} />
          <input name="location" placeholder="Location" className={`w-40 ${inputClass}`} />
          <button type="submit" disabled={recvPending} className={buttonClass}>
            Receive into stock
          </button>
          <ActionError state={recvState} />
          <ActionMessage state={recvState} />
        </form>
      ) : null}
    </div>
  );
}

export function ShortagePoForm({ configId }: { configId: string }) {
  const [state, formAction, pending] = useActionState(
    openShortagePoAction,
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="configId" value={configId} />
      <div className="flex flex-wrap gap-2">
        <input name="supplier" required placeholder="Supplier" className={inputClass} />
        <input name="by" defaultValue="m.chen" className={`w-32 ${inputClass}`} />
        <button type="submit" disabled={pending} className={buttonClass}>
          Open PO for shortages
        </button>
      </div>
      <ActionError state={state} />
    </form>
  );
}

export function CreateKitForm({
  articleId,
  configId,
}: {
  articleId: string;
  configId: string;
}) {
  const [state, formAction, pending] = useActionState(createKitAction, initialState);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="configId" value={configId} />
      <input name="by" defaultValue="m.chen" className={inputClass} />
      <input name="notes" placeholder="Notes (optional)" className={inputClass} />
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Kit
      </button>
    </form>
  );
}

export function AllocateKitLineForm({
  kitId,
  kitLineId,
  lots,
}: {
  kitId: string;
  kitLineId: string;
  lots: Array<{ id: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    allocateKitLineAction,
    initialState,
  );
  useRefreshOnOk(state);
  if (lots.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No matching lots on hand.</p>;
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="kitId" value={kitId} />
      <input type="hidden" name="kitLineId" value={kitLineId} />
      <select name="lotId" className={compactInputClass}>
        {lots.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <input name="by" defaultValue="m.chen" className={`w-24 ${compactInputClass}`} />
      <button type="submit" disabled={pending} className="text-xs underline">
        Allocate
      </button>
      {state.error ? <span className="text-xs text-[var(--danger)]">{state.error}</span> : null}
    </form>
  );
}

export function UnallocateKitLineForm({
  kitId,
  kitLineId,
}: {
  kitId: string;
  kitLineId: string;
}) {
  const [state, formAction, pending] = useActionState(
    unallocateKitLineAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="kitId" value={kitId} />
      <input type="hidden" name="kitLineId" value={kitLineId} />
      <input type="hidden" name="by" value="m.chen" />
      {state.error ? <span className="mr-1 text-xs text-[var(--danger)]">{state.error}</span> : null}
      <button type="submit" disabled={pending} className="text-xs underline">
        Unallocate
      </button>
    </form>
  );
}

export function AllocateRemainingForm({
  kitId,
  by,
}: {
  kitId: string;
  by?: string;
}) {
  const [state, formAction, pending] = useActionState(
    allocateRemainingAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="kitId" value={kitId} />
      {by ? (
        <input type="hidden" name="by" value={by} />
      ) : (
        <input name="by" defaultValue="m.chen" className={inputClass} />
      )}
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Allocate remaining
      </button>
    </form>
  );
}

export function KitLifecycleButtons({
  kitId,
  articleId,
  status,
}: {
  kitId: string;
  articleId: string;
  status: string;
}) {
  const [issueState, issueAction, issuePending] = useActionState(
    issueKitAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelKitAction,
    initialState,
  );
  useRefreshOnOk(issueState);
  useRefreshOnOk(cancelState);
  const [by, setBy] = useState("m.chen");
  return (
    <div className="space-y-3">
      <input
        value={by}
        onChange={(e) => setBy(e.target.value)}
        className={inputClass}
        aria-label="Identity"
      />
      {status === "open" || status === "reserved" ? (
        <AllocateRemainingForm kitId={kitId} by={by} />
      ) : null}
      {status === "open" || status === "reserved" ? (
        <form action={issueAction} className="space-y-2">
          <input type="hidden" name="kitId" value={kitId} />
          <input type="hidden" name="articleId" value={articleId} />
          <input type="hidden" name="by" value={by} />
          <ActionError state={issueState} />
          <ActionMessage state={issueState} />
          <button type="submit" disabled={issuePending} className={buttonClass}>
            Issue kit (stamp as-built)
          </button>
        </form>
      ) : null}
      {status !== "issued" && status !== "cancelled" ? (
        <form action={cancelAction} className="space-y-2">
          <input type="hidden" name="kitId" value={kitId} />
          <input type="hidden" name="by" value={by} />
          <ActionError state={cancelState} />
          <ActionMessage state={cancelState} />
          <button type="submit" disabled={cancelPending} className={subtleButtonClass}>
            Cancel kit
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function ImportBomForm({ configId }: { configId: string }) {
  const [state, formAction, pending] = useActionState(
    importBomCsvAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="configId" value={configId} />
      <textarea
        name="csv"
        placeholder={"find,part,rev,qty,notes\n10,PN-100,A,1,"}
        className={`min-h-24 font-mono text-xs ${inputClass}`}
      />
      <input type="file" name="file" accept=".csv,text/csv" className="block w-full text-sm" />
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Import CSV
      </button>
    </form>
  );
}

export function EditPartForm({
  part,
}: {
  part: {
    id: string;
    name: string;
    category: string;
    sourcing: string;
    kind: string;
    description: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updatePartAction, initialState);
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="partId" value={part.id} />
      <input name="name" required defaultValue={part.name} className={inputClass} />
      <input name="category" required defaultValue={part.category} className={inputClass} />
      <textarea
        name="description"
        defaultValue={part.description}
        placeholder="Description"
        className={`min-h-16 ${inputClass}`}
      />
      <div className="flex gap-2">
        <select name="sourcing" defaultValue={part.sourcing} className={inputClass}>
          <option value="make">make</option>
          <option value="buy">buy</option>
          <option value="cots">cots</option>
        </select>
        <select name="kind" defaultValue={part.kind} className={inputClass}>
          <option value="component">component</option>
          <option value="assembly">assembly</option>
        </select>
      </div>
      <ActionError state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Save part
      </button>
    </form>
  );
}

export function ReverseAsBuiltButton({
  asBuiltId,
  articleId,
}: {
  asBuiltId: string;
  articleId: string;
}) {
  const [state, formAction, pending] = useActionState(
    reverseAsBuiltAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="asBuiltId" value={asBuiltId} />
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="by" value="m.chen" />
      {state.error ? <span className="mr-1 text-xs text-[var(--danger)]">{state.error}</span> : null}
      <button type="submit" disabled={pending} className="text-xs text-[var(--danger)] underline">
        reverse
      </button>
    </form>
  );
}
