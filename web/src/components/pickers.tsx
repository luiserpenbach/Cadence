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

export function FloorPicker({
  articles,
  stands,
  articleId,
  standId,
}: {
  articles: Array<{ id: string; serial: string; name: string }>;
  stands: Array<{ id: string; key: string }>;
  articleId?: string;
  standId?: string;
}) {
  const router = useRouter();
  function go(next: { article?: string; stand?: string }) {
    const a = next.article ?? articleId ?? "";
    const st = next.stand ?? standId ?? "";
    const q = new URLSearchParams();
    if (a) q.set("article", a);
    if (st) q.set("stand", st);
    router.push(`/floor?${q.toString()}`);
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block text-sm">
        Article
        <select
          value={articleId ?? ""}
          onChange={(e) => go({ article: e.target.value })}
          className={`mt-1 block ${inputClass}`}
        >
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.serial} — {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Stand
        <select
          value={standId ?? ""}
          onChange={(e) => go({ stand: e.target.value })}
          className={`mt-1 block ${inputClass}`}
        >
          {stands.map((st) => (
            <option key={st.id} value={st.id}>
              {st.key}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
