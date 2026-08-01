import { AppShell, Badge, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import {
  NewProcedureForm,
  NewTestDefForm,
  ReviseProcedureForm,
} from "../../components/authoring-forms";

export const dynamic = "force-dynamic";

export default function ProceduresPage() {
  ensureAppData();
  const db = getDb();
  const procedures = db.select().from(s.procedures).all();
  const testDefs = db.select().from(s.testDefinitions).all();

  // group versions by key, newest (longest, then greatest) last
  const byKey = new Map<string, typeof procedures>();
  for (const p of procedures) {
    const list = byKey.get(p.key) ?? [];
    list.push(p);
    byKey.set(p.key, list);
  }
  for (const list of byKey.values()) {
    list.sort(
      (a, b) => a.version.length - b.version.length || a.version.localeCompare(b.version),
    );
  }

  return (
    <AppShell
      title="Procedures & tests"
      subtitle="Versioned instructions and the test vocabulary configs pin. Editing a procedure releases a new version; released configs keep the text they shipped with."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">Procedures</h2>
          <div className="mt-3 space-y-6">
            {[...byKey.entries()].map(([key, versions]) => {
              const latest = versions[versions.length - 1];
              return (
                <div key={key} className="rounded-md bg-[var(--panel-strong)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[var(--accent)]">
                      {key}
                    </span>
                    {versions.map((v) => (
                      <Badge
                        key={v.id}
                        tone={v.id === latest.id ? "accent" : "neutral"}
                      >
                        v{v.version}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-1 font-medium">{latest.title}</div>
                  <pre className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
                    {latest.body}
                  </pre>
                  <ReviseProcedureForm
                    procedureId={latest.id}
                    title={latest.title}
                    body={latest.body}
                  />
                </div>
              );
            })}
            {byKey.size === 0 ? (
              <p className="text-sm text-[var(--muted)]">No procedures yet.</p>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-xl">New procedure</h2>
            <NewProcedureForm />
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Test definitions</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {testDefs.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--accent)]">
                    {t.key}
                  </span>
                  <span>{t.name}</span>
                  <Badge tone="neutral">{t.appliesTo}</Badge>
                </li>
              ))}
              {testDefs.length === 0 ? (
                <li className="text-[var(--muted)]">No test definitions yet.</li>
              ) : null}
            </ul>
            <NewTestDefForm />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
