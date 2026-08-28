"use client";

import { useActionState, useState } from "react";
import {
  saveCatalogSettingsAction,
  type ActionState,
} from "../lib/actions";
import type { CatalogPrefix } from "../lib/catalog-format";
import { useRefreshOnOk } from "./pickers";
import { buttonClass, inputClass, subtleButtonClass } from "./ui";

const initialState: ActionState = { ok: false, error: "" };

export function CatalogSettingsForm({
  categories,
  prefixes,
}: {
  categories: string[];
  prefixes: CatalogPrefix[];
}) {
  const [state, formAction, pending] = useActionState(
    saveCatalogSettingsAction,
    initialState,
  );
  const [cats, setCats] = useState(
    categories.length > 0 ? categories : [""],
  );
  const [prefs, setPrefs] = useState<CatalogPrefix[]>(
    prefixes.length > 0 ? prefixes : [{ prefix: "", length: 4 }],
  );
  useRefreshOnOk(state);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-none border border-[var(--line)] bg-[var(--panel)] p-3.5">
          <h2 className="font-display">Categories</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Part category is chosen from this list. It is not free text on the
            catalog form.
          </p>
          <ul className="mt-3 space-y-2">
            {cats.map((cat, i) => (
              <li key={i} className="flex gap-2">
                <input
                  name="category"
                  value={cat}
                  onChange={(e) => {
                    const next = [...cats];
                    next[i] = e.target.value;
                    setCats(next);
                  }}
                  placeholder="Category"
                  className={inputClass}
                />
                <button
                  type="button"
                  className={subtleButtonClass}
                  onClick={() => {
                    const next = cats.filter((_, idx) => idx !== i);
                    setCats(next.length > 0 ? next : [""]);
                  }}
                  aria-label={`Remove category ${cat || i + 1}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`mt-3 ${subtleButtonClass}`}
            onClick={() => setCats([...cats, ""])}
          >
            Add category
          </button>
        </section>

        <section className="rounded-none border border-[var(--line)] bg-[var(--panel)] p-3.5">
          <h2 className="font-display">Part number prefixes</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Used to auto-fill the next part number. Digits is the numeric width
            (e.g. PN- + 4 → PN-0001).
          </p>
          <ul className="mt-3 space-y-2">
            {prefs.map((row, i) => (
              <li key={i} className="flex gap-2">
                <input
                  name="prefix"
                  value={row.prefix}
                  onChange={(e) => {
                    const next = [...prefs];
                    next[i] = { ...next[i], prefix: e.target.value };
                    setPrefs(next);
                  }}
                  placeholder="Prefix (PN-)"
                  className={`font-mono ${inputClass}`}
                />
                <input
                  name="length"
                  type="number"
                  min={1}
                  max={12}
                  value={row.length}
                  onChange={(e) => {
                    const next = [...prefs];
                    next[i] = { ...next[i], length: Number(e.target.value) };
                    setPrefs(next);
                  }}
                  aria-label="Digit length"
                  className={`w-20 ${inputClass}`}
                />
                <button
                  type="button"
                  className={subtleButtonClass}
                  onClick={() => {
                    const next = prefs.filter((_, idx) => idx !== i);
                    setPrefs(next.length > 0 ? next : [{ prefix: "", length: 4 }]);
                  }}
                  aria-label={`Remove prefix ${row.prefix || i + 1}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`mt-3 ${subtleButtonClass}`}
            onClick={() => setPrefs([...prefs, { prefix: "", length: 4 }])}
          >
            Add prefix
          </button>
        </section>
      </div>

      {state.error ? <p className="msg-error">{state.error}</p> : null}
      {state.ok && state.message ? <p className="msg-ok">{state.message}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass}>
        Save settings
      </button>
    </form>
  );
}
