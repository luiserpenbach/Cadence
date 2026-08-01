import Link from "next/link";

const nav = [
  { href: "/", label: "Overview" },
  { href: "/catalog", label: "Catalog" },
  { href: "/configs", label: "Configs" },
  { href: "/articles", label: "Articles" },
  { href: "/stands", label: "Stands" },
  { href: "/floor", label: "Floor" },
  { href: "/runs", label: "Runs" },
  { href: "/procedures", label: "Procedures" },
  { href: "/trace", label: "Trace" },
  { href: "/change", label: "Change impact" },
  { href: "/inventory", label: "Inventory" },
  { href: "/procurement", label: "Procurement" },
];

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 atmosphere" />
      <header className="border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--panel)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-6 px-6 py-5">
          <div>
            <Link href="/" className="font-display text-3xl tracking-tight text-[var(--ink)]">
              Cadence
            </Link>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
              Hardware configuration control for cryo &amp; thermal proto
            </p>
          </div>
          <div className="hidden text-right sm:block">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
              v0 · bench proto
            </div>
            <div className="mt-1 text-sm text-[var(--muted)]">Design-first · config-cheap</div>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-[var(--ink)] sm:text-4xl">{title}</h1>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset] ${className}`}
    >
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
}) {
  const tones = {
    neutral: "bg-[var(--chip)] text-[var(--muted)]",
    ok: "bg-emerald-100 text-emerald-900",
    warn: "bg-amber-100 text-amber-950",
    danger: "bg-rose-100 text-rose-950",
    accent: "bg-cyan-100 text-cyan-950",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-[var(--muted)]">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--line-soft)] align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
