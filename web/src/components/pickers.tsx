"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "../lib/actions";
import { inputClass } from "./ui";

export function useRefreshOnOk(state: ActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}

export function PartRevPicker({
  name,
  options,
  defaultValue,
  className,
}: {
  name: string;
  options: Array<{ id: string; label: string }>;
  defaultValue?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [value, setValue] = useState(defaultValue ?? options[0]?.id ?? "");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);
  const selected =
    filtered.length === 0
      ? ""
      : filtered.some((o) => o.id === value)
        ? value
        : filtered[0].id;

  return (
    <div className={className}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter parts…"
        className={`mb-1 ${inputClass}`}
        autoComplete="off"
      />
      {/* Hidden field posts the id; the visible select can lag a paint behind filter. */}
      <input type="hidden" name={name} value={selected} />
      <select
        value={selected}
        onChange={(e) => setValue(e.target.value)}
        className={inputClass}
        aria-label={name}
      >
        {filtered.length === 0 ? (
          <option value="">No matches</option>
        ) : (
          filtered.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
