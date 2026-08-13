import Link from "next/link";
import { AppShell, Badge, DataTable, Panel, linkClass } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { CutConfigForm } from "../../components/forms";
import { NewConfigForm } from "../../components/authoring-forms";

export const dynamic = "force-dynamic";

export default function ConfigsPage() {
  ensureAppData();
  const configs = getDb().select().from(s.configurations).all();
  const byId = Object.fromEntries(configs.map((c) => [c.id, c]));

  return (
    <AppShell title="Configs">
      <div className="grid gap-4 lg:grid-cols-3">
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
                className={linkClass}
              >
                Open
              </Link>,
            ])}
          />
        </Panel>

        <div className="space-y-5">
        <Panel>
          <h2 className="font-display">Cut new config</h2>
          <CutConfigForm
            configs={configs.map((c) => ({
              id: c.id,
              key: c.key,
              kind: c.kind,
            }))}
            defaultBasedOnId={
              [...configs].reverse().find((c) => c.status === "released")?.id ??
              configs[0]?.id
            }
          />
        </Panel>

        <Panel>
          <h2 className="font-display">New config</h2>
          <NewConfigForm />
        </Panel>
        </div>
      </div>
    </AppShell>
  );
}
