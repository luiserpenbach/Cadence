"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Hit = { type: string; label: string; sub: string; href: string };

const pages: Hit[] = [
  ["Dashboard", "/"],
  ["Parts", "/catalog"],
  ["Configs", "/configs"],
  ["Articles", "/articles"],
  ["Stands", "/stands"],
  ["Inventory", "/inventory"],
  ["Kits", "/kits"],
  ["Floor", "/floor"],
  ["Runs", "/runs"],
  ["Procedures", "/procedures"],
  ["Change impact", "/change"],
  ["Issues", "/issues"],
  ["Trace", "/trace"],
  ["Activity", "/activity"],
  ["Procurement", "/procurement"],
].map(([label, href]) => ({ type: "page", label, sub: "", href }));

// ⌘K / Ctrl-K: jump to any record by the identifier in your hand.
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((data: { hits: Hit[] }) => {
          setHits(data.hits);
          setActive(0);
        })
        .catch(() => {
          /* aborted or offline: keep the previous results */
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const q = query.trim().toLowerCase();
  const pageHits = q
    ? pages.filter((p) => p.label.toLowerCase().includes(q))
    : pages;
  const results = q.length < 2 ? pageHits : [...hits, ...pageHits];

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    close();
    router.push(hit.href);
  };

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-7 w-64 max-w-full items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--control)] px-2.5 text-left text-[13px] text-[var(--muted)] hover:border-[color-mix(in_oklab,var(--ink)_22%,transparent)]"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <span className="flex-1 truncate">Search</span>
        <kbd className="font-mono text-[10px]">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[14vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="w-full max-w-xl overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
                if (e.target.value.trim().length < 2) setHits([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  close();
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder="Part number, serial, config, run, lot, issue…"
              aria-label="Search"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-results"
              className="w-full border-b border-[var(--line-soft)] bg-transparent px-4 py-3 text-sm outline-none"
              style={{ borderRadius: 0, outline: "none" }}
            />
            <ul
              ref={listRef}
              id="command-palette-results"
              role="listbox"
              className="max-h-[50vh] overflow-y-auto p-1.5"
            >
              {results.map((hit, i) => (
                <li
                  key={`${hit.type}:${hit.href}:${hit.label}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(hit);
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-sm ${
                    i === active ? "bg-[var(--panel-strong)]" : ""
                  }`}
                >
                  <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    {hit.type}
                  </span>
                  <span
                    className={
                      hit.type === "page" ? "" : "shrink-0 font-mono text-xs"
                    }
                  >
                    {hit.label}
                  </span>
                  <span className="truncate text-[var(--muted)]">{hit.sub}</span>
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-2.5 py-3 text-sm text-[var(--muted)]">
                  Nothing matches “{query.trim()}”.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
