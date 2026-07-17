import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Badge, DataTable, Panel } from "../../../components/ui";
import { ensureAppData } from "../../../lib/bootstrap";
import { getConfigBundle } from "../../../lib/queries";
import { releaseConfig } from "../../../lib/actions";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ConfigDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureAppData();
  const { id } = await params;
  const bundle = getConfigBundle(id);
  if (!bundle) notFound();

  const { config, bom, tests, procedures, effectivity, explicitArticles } =
    bundle;

  const basedOn = config.basedOnConfigId
    ? getDb()
        .select()
        .from(s.configurations)
        .where(eq(s.configurations.id, config.basedOnConfigId))
        .get()
    : null;

  const stands = getDb().select().from(s.stands).all();
  const standById = Object.fromEntries(stands.map((st) => [st.id, st]));

  return (
    <AppShell
      title={config.key}
      subtitle={config.name}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={config.kind === "stand" ? "accent" : "neutral"}>
          {config.kind}
        </Badge>
        <Badge tone={config.status === "released" ? "ok" : "warn"}>
          {config.status}
        </Badge>
        <Badge tone={config.riskClass === "R3" ? "danger" : "neutral"}>
          {config.riskClass}
        </Badge>
        {basedOn ? (
          <span className="text-sm text-[var(--muted)]">
            based on{" "}
            <Link className="font-mono underline" href={`/configs/${basedOn.id}`}>
              {basedOn.key}
            </Link>
          </span>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">BoM pins</h2>
          <div className="mt-3">
            <DataTable
              headers={["Find", "Part", "Rev", "Qty", "Name"]}
              rows={bom
                .slice()
                .sort((a, b) => a.findNumber.localeCompare(b.findNumber))
                .map((l) => [
                  <span key="f" className="font-mono text-xs">
                    {l.findNumber}
                  </span>,
                  <span key="p" className="font-mono text-xs">
                    {l.partNumber}
                  </span>,
                  l.revision,
                  String(l.qty),
                  l.name,
                ])}
            />
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-xl">Effectivity</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {effectivity.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md bg-[var(--panel-strong)] px-3 py-2"
                >
                  <div>
                    Articles:{" "}
                    {e.anyArticle
                      ? e.serialFrom
                        ? `from ${e.serialFrom}`
                        : "any"
                      : explicitArticles
                          .filter((a) => a.effectivityId === e.id)
                          .map((a) => a.serial)
                          .join(", ") || "explicit list"}
                  </div>
                  <div>
                    Stand:{" "}
                    {e.anyStand
                      ? "any"
                      : e.standId
                        ? standById[e.standId]?.key
                        : "—"}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {config.status !== "released" ? (
            <Panel>
              <h2 className="font-display text-xl">Release</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {config.riskClass === "R3"
                  ? "R3 requires reviewer acknowledgment."
                  : "Soft gate — tests may still be draft."}
              </p>
              <form action={releaseConfig} className="mt-3 space-y-2">
                <input type="hidden" name="configId" value={config.id} />
                <input
                  name="by"
                  placeholder="Released by"
                  defaultValue="m.chen"
                  className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
                />
                {config.riskClass === "R3" ? (
                  <input
                    name="reviewer"
                    placeholder="Reviewer"
                    required
                    className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  />
                ) : null}
                <button
                  type="submit"
                  className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg0)]"
                >
                  Release config
                </button>
              </form>
            </Panel>
          ) : (
            <Panel>
              <h2 className="font-display text-xl">Released</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                by {config.releasedBy}
                {config.reviewerAckBy
                  ? ` · reviewer ${config.reviewerAckBy}`
                  : ""}
              </p>
            </Panel>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="font-display text-xl">Required tests</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {tests.map((t) => (
              <li key={t.id} className="flex gap-2">
                <span className="font-mono text-xs text-[var(--accent)]">
                  {t.key}
                </span>
                <span>{t.name}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h2 className="font-display text-xl">Procedures</h2>
          <div className="mt-3 space-y-4">
            {procedures.map((p) => (
              <div key={p.id}>
                <div className="font-mono text-xs text-[var(--accent)]">
                  {p.key} · v{p.version}
                </div>
                <div className="font-medium">{p.title}</div>
                <pre className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
                  {p.body}
                </pre>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {config.notes ? (
        <Panel className="mt-5">
          <h2 className="font-display text-xl">Notes</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{config.notes}</p>
        </Panel>
      ) : null}
    </AppShell>
  );
}
