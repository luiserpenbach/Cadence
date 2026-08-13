import Link from "next/link";
import { AppShell, Badge, DataTable, Panel, buttonClass, inputClass } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import { trace } from "../../lib/domain/trace";
import { QrLabel } from "../../components/qr";

export const dynamic = "force-dynamic";

export default async function TracePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  ensureAppData();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const result = query ? trace(getDb(), query) : null;

  const searchBox = (
    <Panel>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="block grow text-sm">
          Serial / lot / article
          <input
            name="q"
            defaultValue={query}
            placeholder="Serial, lot, or article"
            className={`mt-1 font-mono ${inputClass}`}
          />
        </label>
        <button
          type="submit"
          className={buttonClass}
        >
          Trace
        </button>
      </form>
    </Panel>
  );

  return (
    <AppShell title="Trace">
      <div className="mb-5">{searchBox}</div>

      {result === null ? null : result.kind === "none" ? (
        <Panel>
          <p className="text-sm text-[var(--muted)]">
            Nothing matches <span className="font-mono">{query}</span>. Trace
            matches article serials, as-built serial/lot values, and inventory
            lot codes exactly (case-insensitive).
          </p>
        </Panel>
      ) : result.kind === "article" ? (
        <>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-lg tracking-tight">
                {result.article.serial} — {result.article.name}
              </div>
              <div className="mt-2 flex gap-2">
                <Badge tone="neutral">{result.article.status}</Badge>
                <Link
                  className="text-sm underline"
                  href={`/articles/${result.article.id}`}
                >
                  Open article
                </Link>
              </div>
            </div>
            <QrLabel identifier={result.article.serial} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="font-display">Build history (as-built)</h2>
              <div className="mt-3">
                <DataTable
                  headers={["Part", "Rev", "Qty", "Serial/Lot", "Run", "When"]}
                  rows={result.asBuilt.map((l) => [
                    <span key="p" className="font-mono text-xs">
                      {l.partNumber}
                    </span>,
                    l.revision,
                    String(l.qty),
                    l.serialOrLot ? (
                      <Link
                        key="s"
                        className="font-mono text-xs underline"
                        href={`/trace?q=${encodeURIComponent(l.serialOrLot)}`}
                      >
                        {l.serialOrLot}
                      </Link>
                    ) : (
                      "—"
                    ),
                    l.runId ? (
                      <Link
                        key="r"
                        className="font-mono text-xs underline"
                        href={`/runs/${l.runId}`}
                      >
                        {l.runKey}
                      </Link>
                    ) : (
                      "—"
                    ),
                    <span key="w" className="text-xs text-[var(--muted)]">
                      {l.recordedAt}
                    </span>,
                  ])}
                />
              </div>
            </Panel>

            <Panel>
              <h2 className="font-display">
                Test history (runs &amp; configs)
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {result.runs.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-none bg-[var(--panel-strong)] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="font-mono text-xs underline"
                        href={`/runs/${r.id}`}
                      >
                        {r.key}
                      </Link>
                      <Badge tone="neutral">{r.status}</Badge>
                      <span className="text-xs text-[var(--muted)]">
                        @ {r.standKey}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <Link
                        className="font-mono underline"
                        href={`/configs/${r.articleConfigId}`}
                      >
                        {r.articleConfigKey}
                      </Link>
                      <span className="text-[var(--muted)]">+</span>
                      <Link
                        className="font-mono underline"
                        href={`/configs/${r.standConfigId}`}
                      >
                        {r.standConfigKey}
                      </Link>
                      <Badge tone={r.gapCount ? "warn" : "ok"}>
                        {r.passCount} pass · {r.gapCount} other
                      </Badge>
                      {r.executionCount > 0 ? (
                        <Badge tone="accent">
                          {r.executionCount} as-run
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
                {result.runs.length === 0 ? (
                  <li className="text-[var(--muted)]">No runs yet.</li>
                ) : null}
              </ul>
            </Panel>
          </div>
        </>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="font-mono text-lg tracking-tight">
              {result.identifier}
            </div>
            <QrLabel identifier={result.identifier} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel>
              <h2 className="font-display">Installed on</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {result.installs.map((i, idx) => (
                  <li
                    key={idx}
                    className="rounded-none bg-[var(--panel-strong)] px-3 py-2"
                  >
                    <Link
                      className="font-mono text-xs underline"
                      href={`/trace?q=${encodeURIComponent(i.articleSerial)}`}
                    >
                      {i.articleSerial}
                    </Link>{" "}
                    <span className="text-xs">
                      {i.partNumber} @ {i.revision} × {i.qty}
                    </span>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {i.recordedAt}
                      {i.runId ? (
                        <>
                          {" · "}
                          <Link className="underline" href={`/runs/${i.runId}`}>
                            {i.runKey}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
                {result.installs.length === 0 ? (
                  <li className="text-[var(--muted)]">Not installed anywhere.</li>
                ) : null}
              </ul>
            </Panel>

            <Panel>
              <h2 className="font-display">Inventory</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {result.lots.map((l, idx) => (
                  <li
                    key={idx}
                    className="rounded-none bg-[var(--panel-strong)] px-3 py-2"
                  >
                    <span className="font-mono text-xs">{l.partNumber}</span> @{" "}
                    {l.revision}
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {l.qtyOnHand} on hand · {l.location}
                    </div>
                  </li>
                ))}
                {result.lots.length === 0 ? (
                  <li className="text-[var(--muted)]">No stock under this code.</li>
                ) : null}
              </ul>
            </Panel>

            <Panel>
              <h2 className="font-display">Supplier trail</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {result.purchaseOrders.map((po, idx) => (
                  <li
                    key={idx}
                    className="rounded-none bg-[var(--panel-strong)] px-3 py-2"
                  >
                    <span className="font-mono text-xs">{po.poNumber}</span> ·{" "}
                    {po.supplier}
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {po.partNumber} @ {po.revision} × {po.qty} ·{" "}
                      <Badge tone="neutral">{po.status}</Badge>
                    </div>
                  </li>
                ))}
                {result.purchaseOrders.length === 0 ? (
                  <li className="text-[var(--muted)]">
                    No purchase orders for these part revisions.
                  </li>
                ) : null}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
}
