import Link from "next/link";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { CutConfigForm } from "../../components/forms";

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
          <CutConfigForm
            configs={configs.map((c) => ({
              id: c.id,
              key: c.key,
              kind: c.kind,
            }))}
            defaultBasedOnId={configs.find((c) => c.key === "CH4-FEED-N+1")?.id}
          />
        </Panel>
      </div>
    </AppShell>
  );
}
