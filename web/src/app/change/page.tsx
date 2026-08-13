import Link from "next/link";
import { AppShell, Badge, DataTable, Panel, buttonClass, inputClass, linkClass } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { buildImpactReport, getDefaultDelta } from "../../lib/impact";
import { ShortagePoForm } from "../../components/inventory-forms";

export const dynamic = "force-dynamic";

export default async function ChangePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  ensureAppData();
  const params = await searchParams;
  const configs = getDb().select().from(s.configurations).all();

  const fromParam = typeof params.from === "string" ? params.from : "";
  const toParam = typeof params.to === "string" ? params.to : "";
  const fallback = getDefaultDelta();
  const fromId = fromParam || fallback?.from.id || "";
  const toId = toParam || fallback?.to.id || "";

  const impact = fromId && toId ? buildImpactReport(fromId, toId) : null;

  const picker = (
    <Panel>
      <h2 className="font-display">Compare configs</h2>
      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          From
          <select
            name="from"
            defaultValue={fromId}
            className={`mt-1 block ${inputClass}`}
          >
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.key} ({c.status})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          To
          <select
            name="to"
            defaultValue={toId}
            className={`mt-1 block ${inputClass}`}
          >
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.key} ({c.status})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className={buttonClass}
        >
          Compare
        </button>
      </form>
    </Panel>
  );

  if (!impact) {
    return (
      <AppShell title="Change">
        {configs.length === 0 ? (
          <Panel>
            No configs yet — create one on the{" "}
            <Link className="underline" href="/configs">
              Configs
            </Link>{" "}
            page.
          </Panel>
        ) : (
          picker
        )}
      </AppShell>
    );
  }

  const { from, to } = impact;

  return (
    <AppShell
      title="Change"
      subtitle={`${from.key} → ${to.key}`}
    >
      <div className="mb-5">{picker}</div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={to.riskClass === "R3" ? "danger" : "neutral"}>
          {to.riskClass}
        </Badge>
        <Badge tone={to.status === "released" ? "ok" : "warn"}>
          {to.status}
        </Badge>
        {to.reviewerAckBy ? (
          <Badge tone="accent">reviewer {to.reviewerAckBy}</Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display">BoM delta</h2>
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
                    {d.name}:{" "}
                    {d.fromPartNumber !== d.toPartNumber
                      ? `${d.fromPartNumber}@${d.fromRevision} → ${d.toPartNumber}@${d.toRevision}`
                      : `rev ${d.fromRevision}→${d.toRevision}`}
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
          <h2 className="font-display">Test matrix</h2>
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
            {impact.testDiff.removed.length ? (
              <div>
                <div className="text-xs uppercase text-[var(--muted)]">
                  Removed
                </div>
                {impact.testDiff.removed.map((t) => (
                  <div key={t.id} className="font-mono text-xs">
                    {t.key}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href={`/configs/${to.id}`}
            className={`mt-4 inline-block ${linkClass}`}
          >
            Open {to.key}
          </Link>
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="font-display">Inventory shortages</h2>
          {impact.inventoryShortages.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Enough on hand (plus inbound POs) for {impact.kitCount} kit
              {impact.kitCount === 1 ? "" : "s"} of {to.key}.
            </p>
          ) : (
            <>
              <DataTable
                compact
                headers={["Part", "Rev", "Need", "Avail", "On hand", "Inbound", "Short"]}
                rows={impact.inventoryShortages.map((row) => [
                  <span key="p" className="font-mono text-xs">
                    {row.partNumber}
                  </span>,
                  row.revision,
                  String(row.needed),
                  String(row.available),
                  String(row.onHand),
                  String(row.inbound),
                  String(row.short),
                ])}
              />
              <ShortagePoForm configId={to.id} />
            </>
          )}
        </Panel>
        <Panel>
          <h2 className="font-display">Articles still on prior</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Serials before the {to.key} effectivity cut-in remain on {from.key}.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {impact.articlesOnPrior.map((a) => (
              <li key={a.serial} className="font-mono text-xs">
                {a.serial} — {a.name}
              </li>
            ))}
            {impact.articlesOnPrior.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">None.</li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
