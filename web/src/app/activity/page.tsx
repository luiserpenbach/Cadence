import Link from "next/link";
import {
  AppShell,
  Badge,
  DataTable,
  Panel,
  inputClass,
  subtleButtonClass,
} from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import {
  describeRef,
  listAudit,
  verifyAuditChain,
} from "../../lib/domain/audit";
import { formatWhen } from "../../components/issues-ui";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  ensureAppData();
  const sp = await searchParams;
  const db = getDb();
  const ref = sp.ref?.trim() || undefined;
  const q = sp.q?.trim() || undefined;
  const events = listAudit(db, { ref, q, limit: 300 });
  const chain = verifyAuditChain(db);
  const refName = ref ? describeRef(db, ref) : null;

  return (
    <AppShell
      title="Activity"
      subtitle="Every write, who made it, and when. Append-only and hash-chained, so edits to history are detectable."
      actions={
        chain.ok ? (
          <Badge tone="ok">chain intact · {chain.count} events</Badge>
        ) : (
          <Badge tone="danger">chain broken at #{chain.brokenAtSeq}</Badge>
        )
      }
    >
      {!chain.ok ? (
        <div className="alert alert-danger mb-5">
          <div className="font-medium">The audit log has been altered</div>
          <div className="mt-1 text-sm">
            Event #{chain.brokenAtSeq} no longer matches the hash chain: a row
            at or before it was edited or removed outside the application.
          </div>
        </div>
      ) : null}
      <Panel>
        <form className="flex flex-wrap items-center gap-2" action="/activity">
          {ref ? <input type="hidden" name="ref" value={ref} /> : null}
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Filter by person, action, or record"
            className={`max-w-sm ${inputClass}`}
          />
          <button type="submit" className={subtleButtonClass}>
            Filter
          </button>
          {ref ? (
            <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Showing history of{" "}
              <span className="font-mono text-xs text-[var(--ink)]">
                {refName ?? ref}
              </span>
              <Link className="underline" href="/activity">
                clear
              </Link>
            </span>
          ) : null}
        </form>
        <div className="mt-3">
          <DataTable
            empty="No activity recorded yet. Every change made from here on is logged."
            headers={["#", "When (UTC)", "Who", "What"]}
            rows={events.map((e) => [
              <span key="n" className="font-mono text-xs text-[var(--muted)]">
                {e.seq}
              </span>,
              <span key="t" className="whitespace-nowrap font-mono text-xs">
                {formatWhen(e.at)}
              </span>,
              e.actor || <span className="text-[var(--muted)]">unknown</span>,
              e.summary,
            ])}
          />
        </div>
      </Panel>
    </AppShell>
  );
}
