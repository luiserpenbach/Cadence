"use client";

import { useActionState } from "react";
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
  importCatalogCsvAction,
  issueKitAction,
  markPoOrderedAction,
  openShortagePoAction,
  openShortageWoAction,
  receivePoAction,
  reverseAsBuiltAction,
  unallocateKitLineAction,
  updatePartAction,
  createWorkOrderAction,
  completeWorkOrderAction,
  cancelWorkOrderAction,
  type ActionState,
} from "../lib/actions";
import { PartRevPicker, useRefreshOnOk } from "./pickers";
import { IdentityField } from "./identity";
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
        <IdentityField className={`w-32 ${inputClass}`} />
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
      <IdentityField />
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
      <input name="supplier" required placeholder="Supplier" className={inputClass} />
      <input name="notes" placeholder="Notes" className={inputClass} />
      <p className="text-xs text-[var(--muted)]">PO number is assigned on create (PO-001…).</p>
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
        <form action={recvAction} className="space-y-2">
          <input type="hidden" name="poId" value={poId} />
          <div className="flex flex-wrap items-end gap-2">
            <IdentityField className={`w-32 ${inputClass}`} />
            <input name="location" placeholder="Location" className={`w-40 ${inputClass}`} />
          </div>
          <input name="certUrl" placeholder="Cert URL (optional)" className={inputClass} />
          <input name="certNotes" placeholder="Cert notes (optional)" className={inputClass} />
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
        <IdentityField className={`w-32 ${inputClass}`} />
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
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="configId" value={configId} />
      <IdentityField />
      <input name="notes" placeholder="Notes (optional)" className={inputClass} />
      <ActionError state={state} />
      <ActionMessage state={state} />
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
      <IdentityField compact className={`w-24 ${compactInputClass}`} />
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
      <IdentityField hidden />
      {state.error ? <span className="mr-1 text-xs text-[var(--danger)]">{state.error}</span> : null}
      <button type="submit" disabled={pending} className="text-xs underline">
        Unallocate
      </button>
    </form>
  );
}

export function AllocateRemainingForm({ kitId }: { kitId: string }) {
  const [state, formAction, pending] = useActionState(
    allocateRemainingAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="kitId" value={kitId} />
      <IdentityField />
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
  return (
    <div className="space-y-3">
      {status === "open" || status === "reserved" ? (
        <AllocateRemainingForm kitId={kitId} />
      ) : null}
      {status === "open" || status === "reserved" ? (
        <form action={issueAction} className="space-y-2">
          <input type="hidden" name="kitId" value={kitId} />
          <input type="hidden" name="articleId" value={articleId} />
          <IdentityField />
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
          <IdentityField />
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
  categories,
}: {
  part: {
    id: string;
    name: string;
    category: string;
    sourcing: string;
    kind: string;
    description: string;
  };
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(updatePartAction, initialState);
  useRefreshOnOk(state);
  const options = categories.includes(part.category)
    ? categories
    : [part.category, ...categories];
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="partId" value={part.id} />
      <input name="name" required defaultValue={part.name} className={inputClass} />
      <select
        name="category"
        required
        defaultValue={part.category}
        className={inputClass}
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
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
      <IdentityField hidden />
      {state.error ? <span className="mr-1 text-xs text-[var(--danger)]">{state.error}</span> : null}
      <button type="submit" disabled={pending} className="text-xs text-[var(--danger)] underline">
        reverse
      </button>
    </form>
  );
}

export function ImportCatalogForm() {
  const [state, formAction, pending] = useActionState(
    importCatalogCsvAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <textarea
        name="csv"
        placeholder={"part,name,rev,category,sourcing,kind,description\nINJ-100,Injector,A,injector,make,component,"}
        className={`min-h-24 font-mono text-xs ${inputClass}`}
      />
      <input type="file" name="file" accept=".csv,text/csv" className="block w-full text-sm" />
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Import parts CSV
      </button>
    </form>
  );
}

export function ShortageWoForm({ configId }: { configId: string }) {
  const [state, formAction, pending] = useActionState(
    openShortageWoAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="configId" value={configId} />
      <IdentityField className={`w-32 ${inputClass}`} />
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={subtleButtonClass}>
        Open work orders for make shorts
      </button>
    </form>
  );
}

export function CreateWorkOrderForm({ partRevs }: { partRevs: PartRev[] }) {
  const [state, formAction, pending] = useActionState(
    createWorkOrderAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <PartRevPicker name="partRevisionId" options={partRevs} />
      <div className="flex gap-2">
        <input name="qty" type="number" step="any" min="0" defaultValue="1" className={`w-24 ${inputClass}`} />
        <input name="lotCode" placeholder="Lot code (optional)" className={`font-mono ${inputClass}`} />
      </div>
      <input name="location" placeholder="Location (SHOP)" className={inputClass} />
      <input name="notes" placeholder="Notes" className={inputClass} />
      <IdentityField />
      <ActionError state={state} />
      <ActionMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Open work order
      </button>
    </form>
  );
}

export function CompleteWorkOrderForm({
  workOrderId,
}: {
  workOrderId: string;
}) {
  const [state, formAction, pending] = useActionState(
    completeWorkOrderAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <IdentityField compact className={`w-24 ${compactInputClass}`} />
      <button type="submit" disabled={pending} className="text-xs underline">
        Complete → lot
      </button>
      {state.error ? <span className="text-xs text-[var(--danger)]">{state.error}</span> : null}
      {state.ok && state.message ? (
        <span className="text-xs text-[var(--ok)]">{state.message}</span>
      ) : null}
    </form>
  );
}

export function CancelWorkOrderForm({ workOrderId }: { workOrderId: string }) {
  const [state, formAction, pending] = useActionState(
    cancelWorkOrderAction,
    initialState,
  );
  useRefreshOnOk(state);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <IdentityField hidden />
      {state.error ? <span className="mr-1 text-xs text-[var(--danger)]">{state.error}</span> : null}
      <button type="submit" disabled={pending} className="text-xs text-[var(--danger)] underline">
        cancel
      </button>
    </form>
  );
}
