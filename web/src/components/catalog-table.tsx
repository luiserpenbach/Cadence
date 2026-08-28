"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { deletePartsAction, type ActionState } from "../lib/actions";
import { matchCatalogQuery } from "../lib/catalog-search";
import { useRefreshOnOk } from "./pickers";
import { Badge, inputClass } from "./ui";

export type CatalogTableRow = {
  id: string;
  partNumber: string;
  name: string;
  category: string;
  sourcing: string;
  kind: string;
  description: string;
  latestRev: string;
  onHand: number;
};

type SortKey =
  | "partNumber"
  | "name"
  | "latestRev"
  | "category"
  | "sourcing"
  | "onHand";

function sortValue(row: CatalogTableRow, key: SortKey): string | number {
  if (key === "onHand") return row.onHand;
  if (key === "category") return `${row.category} ${row.kind}`;
  return row[key];
}

function SortHandle({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium text-[10px] uppercase tracking-[0.1em] hover:text-[var(--ink)]"
    >
      {label}
      <span
        className="inline-flex flex-col leading-[0.65] font-mono text-[8px]"
        aria-hidden
      >
        <span className={active && dir === "asc" ? "text-[var(--ink)]" : "opacity-30"}>
          ▴
        </span>
        <span className={active && dir === "desc" ? "text-[var(--ink)]" : "opacity-30"}>
          ▾
        </span>
      </span>
    </button>
  );
}

export function CatalogTable({
  parts,
  initialQuery,
}: {
  parts: CatalogTableRow[];
  initialQuery: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [sortKey, setSortKey] = useState<SortKey>("partNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const pathname = usePathname();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const needle = q.trim();
      const href = needle
        ? `${pathname}?q=${encodeURIComponent(needle)}`
        : pathname;
      if (`${pathname}${window.location.search}` !== href) {
        window.history.replaceState(null, "", href);
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [q, pathname]);

  const visible = useMemo(() => {
    const rows = parts.filter((p) => matchCatalogQuery(p, q));
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return (
        String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * dir
      );
    });
    return rows;
  }, [parts, q, sortKey, sortDir]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((p) => selected.has(p.id));
  const someVisibleSelected = visible.some((p) => selected.has(p.id));
  const liveSelected = useMemo(() => {
    const ids = new Set(parts.map((p) => p.id));
    return [...selected].filter((id) => ids.has(id));
  }, [parts, selected]);
  const selectedRows = liveSelected
    .map((id) => parts.find((p) => p.id === id))
    .filter((p): p is CatalogTableRow => Boolean(p));

  const [state, formAction, pending] = useActionState(
    deletePartsAction,
    { ok: false, error: "" } satisfies ActionState,
  );
  useRefreshOnOk(state);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const row of visible) next.delete(row.id);
      } else {
        for (const row of visible) next.add(row.id);
      }
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "partNumber", label: "Part" },
    { key: "name", label: "Name" },
    { key: "latestRev", label: "Rev" },
    { key: "category", label: "Type" },
    { key: "sourcing", label: "Sourcing" },
    { key: "onHand", label: "On hand" },
  ];

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search part number, name, category…"
        className={`mb-3 ${inputClass}`}
        autoComplete="off"
        aria-label="Search catalog"
      />
      {liveSelected.length > 0 ? (
        <form
          action={formAction}
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            const names = selectedRows.map((p) => p.partNumber);
            const preview =
              names.length <= 8
                ? names.join("\n")
                : `${names.slice(0, 8).join("\n")}\nand ${names.length - 8} more`;
            const noun = names.length === 1 ? "part" : "parts";
            if (
              !window.confirm(
                `Delete ${names.length} ${noun}?\n\n${preview}\n\nThis cannot be undone.`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          {liveSelected.map((id) => (
            <input key={id} type="hidden" name="partId" value={id} />
          ))}
          <button
            type="submit"
            disabled={pending}
            className="rounded-none border border-[var(--danger)] bg-transparent px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] disabled:opacity-50"
          >
            Delete {liveSelected.length} {liveSelected.length === 1 ? "part" : "parts"}
          </button>
          {state.error ? <p className="msg-error">{state.error}</p> : null}
          {state.ok && state.message ? <p className="msg-ok">{state.message}</p> : null}
        </form>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-[var(--muted)]">
              <th className="w-8 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={visible.length === 0}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = someVisibleSelected && !allVisibleSelected;
                    }
                  }}
                  onChange={toggleAllVisible}
                  aria-label="Select all parts"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-1.5"
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <SortHandle
                    label={col.label}
                    active={sortKey === col.key}
                    dir={sortDir}
                    onClick={() => toggleSort(col.key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-2 py-5 text-sm text-[var(--muted)]"
                >
                  No parts match — create one to the right.
                </td>
              </tr>
            ) : (
              visible.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--line-soft)] align-top hover:bg-[color-mix(in_oklab,var(--ink)_2.5%,transparent)]"
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleRow(p.id)}
                      aria-label={`Select ${p.partNumber}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/catalog/${p.id}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {p.partNumber}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">{p.name}</td>
                  <td className="px-2 py-1.5">
                    {p.latestRev ? (
                      <Badge tone="accent">{p.latestRev}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {p.category}
                    {p.kind === "assembly" ? (
                      <Badge tone="warn"> assembly</Badge>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge tone={p.sourcing === "make" ? "accent" : "neutral"}>
                      {p.sourcing}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5">{p.onHand}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
