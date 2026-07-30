"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import * as s from "../db/schema";
import { id } from "./id";
import { ensureAppData } from "./bootstrap";
import { releaseConfiguration } from "./domain/release";
import { cutConfiguration } from "./domain/cut-config";
import { acknowledgeGaps } from "./domain/ack";
import { createWaiver } from "./domain/waiver";

// Note: a "use server" module may only export async functions, so the
// initial state lives with the client form components.
export type ActionState = {
  ok: boolean;
  error: string;
};

function fail(error: string): ActionState {
  return { ok: false, error };
}

const nonEmpty = z.string().trim().min(1);

const ackSchema = z.object({
  runId: nonEmpty,
  by: nonEmpty,
  reason: nonEmpty,
});

export async function acknowledgeRunGaps(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = ackSchema.safeParse({
    runId: formData.get("runId"),
    by: formData.get("by"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail("Name and reason are required to acknowledge gaps.");
  }
  const { runId, by, reason } = parsed.data;

  const result = acknowledgeGaps(getDb(), { runId, by, reason });
  if (!result.ok) return fail(result.error);

  revalidatePath(`/runs/${runId}`);
  revalidatePath("/runs");
  return { ok: true, error: "" };
}

const waiverSchema = z.object({
  runId: nonEmpty,
  testDefinitionId: nonEmpty,
  reason: nonEmpty,
  approvedBy: nonEmpty,
});

export async function waiveTest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = waiverSchema.safeParse({
    runId: formData.get("runId"),
    testDefinitionId: formData.get("testDefinitionId"),
    reason: formData.get("reason"),
    approvedBy: formData.get("approvedBy"),
  });
  if (!parsed.success) {
    return fail("Test, reason, and approver are required for a waiver.");
  }

  const result = createWaiver(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/runs/${parsed.data.runId}`);
  return { ok: true, error: "" };
}

const testResultSchema = z.object({
  runId: nonEmpty,
  testDefinitionId: nonEmpty,
  status: z.enum(["pass", "fail", "waived"]),
  value: z.string().trim(),
  by: nonEmpty,
});

export async function recordTestResult(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = testResultSchema.safeParse({
    runId: formData.get("runId"),
    testDefinitionId: formData.get("testDefinitionId"),
    status: formData.get("status"),
    value: String(formData.get("value") ?? ""),
    by: formData.get("by"),
  });
  if (!parsed.success) {
    return fail("Test, a valid status (pass/fail/waived), and recorder are required.");
  }
  const { runId, testDefinitionId, status, value, by } = parsed.data;

  const db = getDb();
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
  if (!run) return fail("Run not found.");

  db.insert(s.testResults)
    .values({
      id: id("tres"),
      runId,
      testDefinitionId,
      status,
      value,
      recordedBy: by,
    })
    .run();

  revalidatePath(`/runs/${runId}`);
  return { ok: true, error: "" };
}

const releaseSchema = z.object({
  configId: nonEmpty,
  by: nonEmpty,
  reviewer: z.string().trim().optional(),
});

export async function releaseConfig(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = releaseSchema.safeParse({
    configId: formData.get("configId"),
    by: formData.get("by"),
    reviewer: formData.get("reviewer") ?? undefined,
  });
  if (!parsed.success) {
    return fail("Config and releaser are required.");
  }

  const result = releaseConfiguration(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/configs/${parsed.data.configId}`);
  revalidatePath("/configs");
  return { ok: true, error: "" };
}

const cutSchema = z.object({
  basedOnId: nonEmpty,
  key: nonEmpty,
  name: nonEmpty,
  riskClass: z.enum(s.riskClasses),
});

export async function cutConfigFrom(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = cutSchema.safeParse({
    basedOnId: formData.get("basedOnId"),
    key: formData.get("key"),
    name: formData.get("name"),
    riskClass: formData.get("riskClass"),
  });
  if (!parsed.success) {
    return fail("Base config, key, name, and a valid risk class are required.");
  }

  const result = cutConfiguration(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath("/configs");
  redirect(`/configs/${result.configId}`);
}
