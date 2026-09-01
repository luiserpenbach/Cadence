"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const NAV_EVENT = "cadence-nav";
const COLLAPSE_KEY = "cadence-nav-collapsed";
const SECTIONS_KEY = "cadence-nav-sections";

type SectionId = "hardware" | "testing" | "procurement";
type SectionState = Record<SectionId, boolean>;

const defaultSections: SectionState = {
  hardware: true,
  testing: true,
  procurement: true,
};

const dashboard = { href: "/", label: "Dashboard" };

const sections: Array<{
  id: SectionId;
  label: string;
  items: Array<{ href: string; label: string }>;
}> = [
  {
    id: "hardware",
    label: "Hardware",
    items: [
      { href: "/catalog", label: "Parts" },
      { href: "/configs", label: "Configs" },
      { href: "/articles", label: "Articles" },
      { href: "/stands", label: "Stands" },
      { href: "/inventory", label: "Inventory" },
      { href: "/kits", label: "Kits" },
      { href: "/floor", label: "Floor" },
    ],
  },
  {
    id: "testing",
    label: "Testing",
    items: [
      { href: "/runs", label: "Runs" },
      { href: "/procedures", label: "Procedures" },
      { href: "/trace", label: "Trace" },
      { href: "/change", label: "Change" },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    items: [{ href: "/procurement", label: "Procurement" }],
  },
];

function emitNav() {
  window.dispatchEvent(new Event(NAV_EVENT));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(NAV_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(NAV_EVENT, onStoreChange);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* private mode */
  }
  emitNav();
}

let cachedSections: SectionState | null = null;
let cachedRaw: string | null = null;

function readSections(): SectionState {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) {
      if (cachedSections && cachedRaw === null) return cachedSections;
      cachedRaw = null;
      cachedSections = defaultSections;
      return defaultSections;
    }
    if (raw === cachedRaw && cachedSections) return cachedSections;
    cachedRaw = raw;
    const parsed = JSON.parse(raw) as Partial<SectionState>;
    cachedSections = { ...defaultSections, ...parsed };
    return cachedSections;
  } catch {
    if (cachedSections) return cachedSections;
    return defaultSections;
  }
}

function writeSections(next: SectionState) {
  cachedSections = next;
  cachedRaw = JSON.stringify(next);
  try {
    localStorage.setItem(SECTIONS_KEY, cachedRaw);
  } catch {
    /* private mode */
  }
  emitNav();
}

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ href }: { href: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    "aria-hidden": true as const,
  };
  switch (href) {
    case "/":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="5" height="5" />
          <rect x="9" y="2" width="5" height="5" />
          <rect x="2" y="9" width="5" height="5" />
          <rect x="9" y="9" width="5" height="5" />
        </svg>
      );
    case "/catalog":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" />
          <path d="M3 6.5h10M6.5 3v10" />
        </svg>
      );
    case "/configs":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="8" height="8" />
          <rect x="5.5" y="2.5" width="8" height="8" />
        </svg>
      );
    case "/articles":
      return (
        <svg {...common}>
          <path d="M3 4h10M3 8h10M3 12h7" />
        </svg>
      );
    case "/stands":
      return (
        <svg {...common}>
          <path d="M2 6.5h12M4 6.5v6M12 6.5v6M2 12.5h12" />
        </svg>
      );
    case "/inventory":
      return (
        <svg {...common}>
          <path d="M3 12h10v-2.5H3zM4.5 9.5h7V7H4.5zM6 7h4V4.5H6z" />
        </svg>
      );
    case "/kits":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="10" height="8" />
          <path d="M3 8h10M8 5v8" />
        </svg>
      );
    case "/floor":
      return (
        <svg {...common}>
          <path d="M3 13V5l5-2 5 2v8l-5 2zM8 3v12" />
        </svg>
      );
    case "/runs":
      return (
        <svg {...common}>
          <path d="M5 3.5v9l8-4.5z" />
        </svg>
      );
    case "/procedures":
      return (
        <svg {...common}>
          <path d="M4 4h8M4 8h8M4 12h5" />
        </svg>
      );
    case "/trace":
      return (
        <svg {...common}>
          <path d="M3 12h3l2-8h3l2 4h0" />
          <circle cx="13" cy="8" r="1.2" />
        </svg>
      );
    case "/change":
      return (
        <svg {...common}>
          <path d="M4 6h6l-1.5-1.5M10 10H4l1.5 1.5" />
        </svg>
      );
    case "/procurement":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" />
          <path d="M6 3v10" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="8" height="8" />
        </svg>
      );
  }
}

function NavLink({
  href,
  label,
  pathname,
  collapsed,
}: {
  href: string;
  label: string;
  pathname: string;
  collapsed: boolean;
}) {
  const active = isActive(href, pathname);
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`relative flex items-center gap-2.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.08em] ${
        collapsed ? "justify-center px-0" : "px-3"
      } ${
        active
          ? "bg-[var(--panel-strong)] text-[var(--ink)]"
          : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {active ? (
        <span className="absolute inset-y-1 left-0 w-[2px] bg-[var(--ink)]" />
      ) : null}
      <NavIcon href={href} />
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname() ?? "/";
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const open = useSyncExternalStore(subscribe, readSections, () => defaultSections);

  return (
    <aside
      className={`sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-[var(--line)] border-l-[3px] border-l-[var(--ink)] bg-[var(--panel)] ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      <div className="flex h-11 shrink-0 items-center border-b border-[var(--line)]">
        <Link
          href="/"
          className={`flex min-w-0 items-center gap-2 text-[var(--ink)] ${
            collapsed ? "h-11 flex-1 justify-center px-0" : "flex-1 px-3"
          }`}
        >
          <span aria-hidden className="block h-2.5 w-2.5 shrink-0 bg-[var(--ink)]" />
          {collapsed ? (
            <span className="sr-only">cadence</span>
          ) : (
            <span className="font-logo">cadence</span>
          )}
        </Link>
        <button
          type="button"
          className={`inline-flex h-11 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] ${
            collapsed ? "flex-1" : "w-9"
          }`}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={() => writeCollapsed(!collapsed)}
        >
          <CollapseIcon expanded={!collapsed} />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-2 pb-14">
        <NavLink
          href={dashboard.href}
          label={dashboard.label}
          pathname={pathname}
          collapsed={collapsed}
        />

        {sections.map((section) => {
          const sectionOpen = collapsed || open[section.id];
          const sectionActive = section.items.some((item) =>
            isActive(item.href, pathname),
          );
          return (
            <div key={section.id} className="mt-2">
              {collapsed ? (
                <div
                  className="mx-2 mb-1 border-t border-[var(--line-soft)]"
                  aria-hidden
                />
              ) : (
                <button
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    sectionActive
                      ? "text-[var(--ink)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                  aria-expanded={sectionOpen}
                  onClick={() =>
                    writeSections({ ...open, [section.id]: !open[section.id] })
                  }
                >
                  {section.label}
                  <span
                    className={`text-[9px] ${sectionOpen ? "" : "-rotate-90"}`}
                    aria-hidden
                  >
                    ▾
                  </span>
                </button>
              )}
              {sectionOpen
                ? section.items.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      pathname={pathname}
                      collapsed={collapsed}
                    />
                  ))
                : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function CollapseIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      {expanded ? (
        <path d="M10 3 5.5 8 10 13M13 3v10" />
      ) : (
        <path d="M6 3 10.5 8 6 13M3 3v10" />
      )}
    </svg>
  );
}
