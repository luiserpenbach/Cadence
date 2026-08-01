import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Badge, Panel } from "../../../../../components/ui";
import { ensureAppData } from "../../../../../lib/bootstrap";
import { getDb } from "../../../../../db";
import { getExecutionView } from "../../../../../lib/domain/execution";
import {
  AbortExecutionForm,
  RecordStepForm,
} from "../../../../../components/forms";

export const dynamic = "force-dynamic";

export default async function ExecutionPage({
  params,
}: {
  params: Promise<{ id: string; executionId: string }>;
}) {
  ensureAppData();
  const { id: runId, executionId } = await params;
  const view = getExecutionView(getDb(), executionId);
  if (!view || view.run.id !== runId) notFound();

  const { execution, procedure, run, steps, nextIndex } = view;
  const recordedCount = steps.filter((s) => s.record).length;

  return (
    <AppShell
      title={`${procedure.key} · v${procedure.version}`}
      subtitle={`${procedure.title} — as-run on ${run.key}`}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge
          tone={
            execution.status === "complete"
              ? "ok"
              : execution.status === "aborted"
                ? "danger"
                : "accent"
          }
        >
          {execution.status}
        </Badge>
        <Badge tone="neutral">
          {recordedCount}/{steps.length} steps
        </Badge>
        <span className="text-sm text-[var(--muted)]">
          started by {execution.startedBy} · {execution.startedAt}
        </span>
        <Link className="ml-auto text-sm underline" href={`/runs/${run.id}`}>
          Back to {run.key}
        </Link>
      </div>

      {execution.status === "aborted" ? (
        <div className="mb-5 rounded-lg border border-rose-300 bg-rose-100 px-4 py-3 text-sm text-rose-950">
          Aborted: {execution.abortReason}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">Steps</h2>
          <ol className="mt-3 space-y-2">
            {steps.map((step) => {
              const isNext = step.index === nextIndex;
              return (
                <li
                  key={step.index}
                  className={`rounded-md px-3 py-2 text-sm ${
                    isNext
                      ? "border border-[var(--accent)] bg-white"
                      : "bg-[var(--panel-strong)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {step.index + 1}
                    </span>
                    <span className={step.record ? "" : "font-medium"}>
                      {step.instruction}
                    </span>
                    {step.record ? (
                      <Badge
                        tone={
                          step.record.outcome === "done"
                            ? "ok"
                            : step.record.outcome === "flagged"
                              ? "danger"
                              : "warn"
                        }
                      >
                        {step.record.outcome}
                      </Badge>
                    ) : isNext ? (
                      <Badge tone="accent">next</Badge>
                    ) : null}
                  </div>
                  {step.record ? (
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {step.record.value ? `${step.record.value} · ` : ""}
                      {step.record.note ? `${step.record.note} · ` : ""}
                      {step.record.recordedBy} · {step.record.recordedAt}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="space-y-5">
          {nextIndex !== null ? (
            <Panel>
              <h2 className="font-display text-xl">
                Step {nextIndex + 1} of {steps.length}
              </h2>
              <p className="mt-2 text-sm">{steps[nextIndex].instruction}</p>
              <RecordStepForm
                runId={run.id}
                executionId={execution.id}
                stepIndex={nextIndex}
              />
            </Panel>
          ) : (
            <Panel>
              <h2 className="font-display text-xl">
                {execution.status === "complete"
                  ? "Execution complete"
                  : "No steps left"}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {execution.status === "complete"
                  ? `All ${steps.length} steps recorded. This as-run record is immutable.`
                  : "This execution is closed."}
              </p>
            </Panel>
          )}

          {execution.status === "in_progress" ? (
            <Panel>
              <h2 className="font-display text-xl">Abort</h2>
              <AbortExecutionForm runId={run.id} executionId={execution.id} />
            </Panel>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
