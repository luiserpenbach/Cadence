import Link from "next/link";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { cutConfigFrom } from "../../lib/actions";

export const dynamic = "force-dynamic";

export default function ConfigsPage() {
  ensureAppData();
  const configs = getDb().select().from(s.configurations).all();
  const byId = Object.fromEntries(configs.map((c) => [c.id, c]));

  return (
    <AppShell
      title="Configurations"
      subtitle="Cheap to create, gated to release. Article configs and stand configs are separate deployable units."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <DataTable
            headers={["Key", "Kind", "Status", "Risk", "Based on", ""]}
            rows={configs.map((c) => [
              <Link
                key="k"
                href={`/configs/${c.id}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {c.key}
              </Link>,
              <Badge key="kind" tone={c.kind === "stand" ? "accent" : "neutral"}>
                {c.kind}
              </Badge>,
              <Badge
                key="st"
                tone={c.status === "released" ? "ok" : "warn"}
              >
                {c.status}
              </Badge>,
              <Badge
                key="r"
                tone={c.riskClass === "R3" ? "danger" : "neutral"}
              >
                {c.riskClass}
              </Badge>,
              c.basedOnConfigId ? (
                <span key="b" className="font-mono text-xs">
                  {byId[c.basedOnConfigId]?.key ?? "—"}
                </span>
              ) : (
                "—"
              ),
              <Link
                key="o"
                href={`/configs/${c.id}`}
                className="text-sm text-[var(--accent)]"
              >
                Open
              </Link>,
            ])}
          />
        </Panel>

        <Panel>
          <h2 className="font-display text-xl">Cut new config</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Clone BoM pins, procedures, and required tests from a parent.
          </p>
          <form action={cutConfigFrom} className="mt-4 space-y-3">
            <label className="block text-sm">
              Based on
              <select
                name="basedOnId"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2"
                defaultValue={configs.find((c) => c.key === "CH4-FEED-N+1")?.id}
              >
                {configs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.key} ({c.kind})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Key
              <input
                name="key"
                required
                placeholder="CH4-FEED-N+2"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block text-sm">
              Name
              <input
                name="name"
                required
                placeholder="Next overnight cut"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Risk class
              <select
                name="riskClass"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2"
                defaultValue="R2"
              >
                {["R0", "R1", "R2", "R3"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)]"
            >
              Create draft
            </button>
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
