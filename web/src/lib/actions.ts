"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import * as s from "../db/schema";
import { id } from "./id";
import { ensureAppData } from "./bootstrap";

export async function acknowledgeRunGaps(formData: FormData) {
  ensureAppData();
  const runId = String(formData.get("runId") || "");
  const by = String(formData.get("by") || "designer");
  const reason = String(formData.get("reason") || "");
  if (!runId) return;

  getDb()
    .update(s.runs)
    .set({
      gapAcknowledged: true,
      gapAckBy: by,
      gapAckAt: new Date().toISOString(),
      gapAckReason: reason,
    })
    .where(eq(s.runs.id, runId))
    .run();

  revalidatePath(`/runs/${runId}`);
  revalidatePath("/runs");
}

export async function recordTestResult(formData: FormData) {
  ensureAppData();
  const runId = String(formData.get("runId") || "");
  const testDefinitionId = String(formData.get("testDefinitionId") || "");
  const status = String(formData.get("status") || "pass");
  const value = String(formData.get("value") || "");
  const by = String(formData.get("by") || "tech");
  if (!runId || !testDefinitionId) return;

  getDb()
    .insert(s.testResults)
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
}

export async function releaseConfig(formData: FormData) {
  ensureAppData();
  const configId = String(formData.get("configId") || "");
  const by = String(formData.get("by") || "designer");
  const reviewer = String(formData.get("reviewer") || "");
  if (!configId) return;

  const db = getDb();
  const config = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, configId))
    .get();
  if (!config) return;

  const needsReviewer = config.riskClass === "R3";
  db.update(s.configurations)
    .set({
      status: "released",
      releasedAt: new Date().toISOString(),
      releasedBy: by,
      reviewerAckBy: needsReviewer ? reviewer || by : config.reviewerAckBy,
      reviewerAckAt: needsReviewer
        ? new Date().toISOString()
        : config.reviewerAckAt,
    })
    .where(eq(s.configurations.id, configId))
    .run();

  revalidatePath(`/configs/${configId}`);
  revalidatePath("/configs");
}

export async function cutConfigFrom(formData: FormData) {
  ensureAppData();
  const basedOnId = String(formData.get("basedOnId") || "");
  const key = String(formData.get("key") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const riskClass = String(formData.get("riskClass") || "R2");
  if (!basedOnId || !key || !name) return;

  const db = getDb();
  const base = db
    .select()
    .from(s.configurations)
    .where(eq(s.configurations.id, basedOnId))
    .get();
  if (!base) return;

  const newId = id("cfg");
  db.insert(s.configurations)
    .values({
      id: newId,
      key,
      name,
      kind: base.kind,
      status: "draft",
      riskClass,
      basedOnConfigId: basedOnId,
      notes: `Cut from ${base.key}`,
    })
    .run();

  const bom = db
    .select()
    .from(s.configBomLines)
    .where(eq(s.configBomLines.configId, basedOnId))
    .all();
  for (const line of bom) {
    db.insert(s.configBomLines)
      .values({
        id: id("bom"),
        configId: newId,
        partRevisionId: line.partRevisionId,
        qty: line.qty,
        findNumber: line.findNumber,
        notes: line.notes,
      })
      .run();
  }

  const tests = db
    .select()
    .from(s.configRequiredTests)
    .where(eq(s.configRequiredTests.configId, basedOnId))
    .all();
  for (const t of tests) {
    db.insert(s.configRequiredTests)
      .values({
        id: id("crt"),
        configId: newId,
        testDefinitionId: t.testDefinitionId,
      })
      .run();
  }

  const procs = db
    .select()
    .from(s.configProcedures)
    .where(eq(s.configProcedures.configId, basedOnId))
    .all();
  for (const p of procs) {
    db.insert(s.configProcedures)
      .values({
        id: id("cpr"),
        configId: newId,
        procedureId: p.procedureId,
      })
      .run();
  }

  revalidatePath("/configs");
  redirect(`/configs/${newId}`);
}
