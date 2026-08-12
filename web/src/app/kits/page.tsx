import Link from "next/link";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";

export const dynamic = "force-dynamic";

export default function KitsPage() {
  ensureAppData();
  const db = getDb();
  const kits = db.select().from(s.kits).all();
  const articles = Object.fromEntries(
    db.select().from(s.articles).all().map((a) => [a.id, a]),
  );
  const configs = Object.fromEntries(
    db.select().from(s.configurations).all().map((c) => [c.id, c]),
  );

  return (
    <AppShell
      title="Kits"
      subtitle="Reserve lots against a released config, then issue to stamp as-built."
    >
      <Panel>
        <DataTable
          empty={
            <>
              No kits yet — pull one from the{" "}
              <Link className="underline" href="/floor">
                Floor
              </Link>{" "}
              recipe.
            </>
          }
          headers={["Key", "Article", "Config", "Status", ""]}
          rows={kits.map((k) => [
            <span key="k" className="font-mono text-xs">
              {k.key}
            </span>,
            articles[k.articleId]?.serial ?? k.articleId,
            configs[k.configId]?.key ?? k.configId,
            <Badge
              key="s"
              tone={
                k.status === "issued"
                  ? "ok"
                  : k.status === "cancelled"
                    ? "neutral"
                    : k.status === "reserved"
                      ? "accent"
                      : "warn"
              }
            >
              {k.status}
            </Badge>,
            <Link key="o" className="text-sm text-[var(--accent)] underline" href={`/kits/${k.id}`}>
              Open
            </Link>,
          ])}
        />
      </Panel>
    </AppShell>
  );
}
