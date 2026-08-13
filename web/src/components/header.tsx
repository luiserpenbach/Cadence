"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IdentityChip } from "./identity";

const groups = [
  {
    items: [
      { href: "/", label: "Overview" },
      { href: "/catalog", label: "Catalog" },
      { href: "/configs", label: "Configs" },
      { href: "/articles", label: "Articles" },
      { href: "/stands", label: "Stands" },
    ],
  },
  {
    items: [
      { href: "/floor", label: "Floor" },
      { href: "/runs", label: "Runs" },
      { href: "/procedures", label: "Procedures" },
    ],
  },
  {
    items: [
      { href: "/trace", label: "Trace" },
      { href: "/change", label: "Change" },
      { href: "/inventory", label: "Inventory" },
      { href: "/kits", label: "Kits" },
      { href: "/procurement", label: "Procurement" },
    ],
  },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-40 bg-[var(--panel)]">
      <div className="h-[3px] bg-[var(--ink)]" />
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 py-2.5 text-[var(--ink)]"
        >
          <span
            aria-hidden
            className="block h-2.5 w-2.5 bg-[var(--ink)]"
          />
          <span className="font-logo">cadence</span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {groups.map((group, gi) => (
            <div
              key={gi}
              className={
                gi === 0
                  ? "flex"
                  : "ml-1 flex border-l border-[var(--line)] pl-1"
              }
            >
              {group.items.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-2 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${
                      active
                        ? "text-[var(--ink)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {item.label}
                    {active ? (
                      <span className="absolute inset-x-1.5 bottom-0 h-[2px] bg-[var(--ink)]" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <IdentityChip />
      </div>
      <div className="h-px bg-[var(--line)]" />
    </header>
  );
}
