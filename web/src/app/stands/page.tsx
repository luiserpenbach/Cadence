import { AppShell, Panel, DataTable } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";

export const dynamic = "force-dynamic";

export default function StandsPage() {
  ensureAppData();
  const stands = getDb().select().from(s.stands).all();

  return (
    <AppShell
      title="Test stands"
      subtitle="First-class effectivity axis. Stand configs own bench infrastructure separate from article hardware."
    >
      <Panel>
        <DataTable
          headers={["Key", "Name", "Location", "Notes"]}
          rows={stands.map((st) => [
            <span key="k" className="font-mono text-xs">
              {st.key}
            </span>,
            st.name,
            st.location,
            <span key="n" className="text-[var(--muted)]">
              {st.notes || "—"}
            </span>,
          ])}
        />
      </Panel>
    </AppShell>
  );
}
