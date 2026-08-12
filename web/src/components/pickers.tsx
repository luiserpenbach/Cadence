"use client";

import { useMemo, useState } from "react";

const inputClass =
  "w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm";

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
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);
  const shown = filtered;
  return (
    <div className={className}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter parts…"
        className={`mb-1 ${inputClass}`}
      />
      <select
        name={name}
        defaultValue={defaultValue}
        className={inputClass}
      >
        {shown.length === 0 ? (
          <option value="">No matches</option>
        ) : (
          shown.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
