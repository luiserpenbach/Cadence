import { AppHeader } from "./header";

export const inputClass =
  "w-full rounded-none border border-[var(--line)] bg-[var(--control)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--ink)]";
export const compactInputClass =
  "rounded-none border border-[var(--line)] bg-[var(--control)] px-2 py-1 text-xs outline-none focus:border-[var(--ink)]";
export const buttonClass =
  "inline-flex items-center justify-center rounded-none bg-[var(--ink)] px-3 py-1.5 text-sm font-medium text-[var(--bg0)] disabled:opacity-50";
export const subtleButtonClass =
  "inline-flex items-center justify-center rounded-none border border-[var(--line)] bg-transparent px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--panel-strong)]";
export const linkClass =
  "text-[11px] font-medium uppercase tracking-[0.08em] underline underline-offset-2 decoration-[var(--line)] hover:decoration-[var(--ink)]";

export function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" suppressHydrationWarning>
      <AppHeader />
      <main className="mx-auto max-w-7xl px-5 py-5">
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-[var(--line)] pb-3">
          <div>
            <h1 className="font-display text-[var(--ink)]">{title}</h1>
            {subtitle ? (
              <p className="mt-1 max-w-3xl text-[13px] text-[var(--muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0 pb-0.5">{actions}</div> : null}
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
      className={`rounded-none border border-[var(--line)] bg-[var(--panel)] p-3.5 ${className}`}
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
    neutral: "border-[var(--line)] bg-transparent text-[var(--muted)]",
    ok: "border-[color-mix(in_oklab,var(--ok)_40%,var(--line))] bg-[color-mix(in_oklab,var(--ok)_10%,transparent)] text-[var(--ok)]",
    warn: "border-[color-mix(in_oklab,var(--warn)_40%,var(--line))] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] text-[var(--warn)]",
    danger:
      "border-[color-mix(in_oklab,var(--danger)_40%,var(--line))] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-[var(--danger)]",
    accent:
      "border-[color-mix(in_oklab,var(--accent)_40%,var(--line))] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] text-[var(--accent)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-none border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function DataTable({
  headers,
  rows,
  empty,
  compact = false,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full border-collapse text-left text-sm ${compact ? "" : "min-w-[640px]"}`}
      >
        <thead>
          <tr className="border-b border-[var(--line)] text-[var(--muted)]">
            {headers.map((h) => (
              <th
                key={h}
                className="px-2 py-1.5 font-medium text-[10px] uppercase tracking-[0.1em]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-2 py-5 text-sm text-[var(--muted)]"
              >
                {empty ?? "None yet."}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-[var(--line-soft)] align-top hover:bg-[color-mix(in_oklab,var(--ink)_2.5%,transparent)]"
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
