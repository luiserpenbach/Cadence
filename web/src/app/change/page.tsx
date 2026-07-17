import Link from "next/link";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { buildImpactReport } from "../../lib/impact";

export const dynamic = "force-dynamic";

export default function ChangePage() {
  ensureAppData();
  const configs = getDb().select().from(s.configurations).all();
  const from = configs.find((c) => c.key === "CH4-FEED-N");
  const to = configs.find((c) => c.key === "CH4-FEED-N+1");

  if (!from || !to) {
    return (
      <AppShell title="Change impact" subtitle="Seed data missing.">
        <Panel>No baseline delta available.</Panel>
      </AppShell>
    );
  }

  const impact = buildImpactReport(from.id, to.id);

  return (
    <AppShell
      title="Change impact"
      subtitle={`${from.key} → ${to.key} — blast radius for the overnight cut-in.`}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="danger">{to.riskClass}</Badge>
        <Badge tone="ok">{to.status}</Badge>
        {to.reviewerAckBy ? (
          <Badge tone="accent">reviewer {to.reviewerAckBy}</Badge>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">BoM delta</h2>
          <div className="mt-3">
            <DataTable
              headers={["Change", "Find", "Part", "Detail"]}
              rows={impact.bomDeltas.map((d) => [
                <Badge
                  key="t"
                  tone={
                    d.type === "added"
                      ? "ok"
                      : d.type === "removed"
                        ? "danger"
                        : "warn"
                  }
                >
                  {d.type}
                </Badge>,
                <span key="f" className="font-mono text-xs">
                  {d.findNumber || "—"}
                </span>,
                <span key="p" className="font-mono text-xs">
                  {d.partNumber}
                </span>,
                d.type === "changed" ? (
                  <span key="d">
                    {d.name}: rev {d.fromRevision}→{d.toRevision}
                    {d.fromQty !== d.toQty
                      ? ` · qty ${d.fromQty}→${d.toQty}`
                      : ""}
                  </span>
                ) : (
                  <span key="d">
                    {d.name} @ {d.revision} × {d.qty}
                  </span>
                ),
              ])}
            />
          </div>
        </Panel>

        <Panel>
          <h2 className="font-display text-xl">Test matrix</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {impact.staleTestHint}
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Shared</div>
              {impact.testDiff.shared.map((t) => (
                <div key={t.id} className="font-mono text-xs">
                  {t.key}
                </div>
              ))}
            </div>
            {impact.testDiff.added.length ? (
              <div>
                <div className="text-xs uppercase text-[var(--muted)]">Added</div>
                {impact.testDiff.added.map((t) => (
                  <div key={t.id} className="font-mono text-xs">
                    {t.key}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href={`/configs/${to.id}`}
            className="mt-4 inline-block text-sm text-[var(--accent)] underline"
          >
            Open {to.key}
          </Link>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="font-display text-xl">Inventory shortages</h2>
          {impact.inventoryShortages.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Enough on hand for one kit of N+1.
            </p>
          ) : (
            <DataTable
              headers={["Part", "Rev", "Need", "On hand"]}
              rows={impact.inventoryShortages.map((row) => [
                <span key="p" className="font-mono text-xs">
                  {row.partNumber}
                </span>,
                row.revision,
                String(row.needed),
                String(row.onHand),
              ])}
            />
          )}
        </Panel>
        <Panel>
          <h2 className="font-display text-xl">Articles still on prior</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Serials before N+1 effectivity cut-in remain on {from.key}.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {impact.articlesOnPrior.map((a) => (
              <li key={a.serial} className="font-mono text-xs">
                {a.serial} — {a.name}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
