"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import * as s from "../db/schema";
import { id } from "./id";
import { ensureAppData } from "./bootstrap";
import {
  approveRelease,
  releaseConfiguration,
  requestRelease,
  returnToDraft,
} from "./domain/release";
import { cutConfiguration } from "./domain/cut-config";
import { cutInRevision } from "./domain/rev-cut-in";
import { acknowledgeGaps } from "./domain/ack";
import { createWaiver } from "./domain/waiver";
import { completeRun, createRun, startRun } from "./domain/run";
import {
  addPartRevision,
  createArticle,
  createConfig,
  createPart,
  createStand,
  deleteParts,
  updatePart,
} from "./domain/authoring";
import {
  addBomAlternate,
  addBomLine,
  addEffectivityRow,
  addProcedureLink,
  addRequiredTest,
  removeBomAlternate,
  removeBomLine,
  removeEffectivityRow,
  removeProcedureLink,
  removeRequiredTest,
  updateBomLine,
} from "./domain/config-edit";
import { recordAsBuilt, reverseAsBuilt } from "./domain/asbuilt";
import {
  createProcedure,
  createTestDefinition,
  reviseProcedure,
} from "./domain/procedures";
import {
  abortExecution,
  recordStep,
  startExecution,
  stepOutcomes,
} from "./domain/execution";
import {
  addFileAttachment,
  addLinkAttachment,
  removeAttachment,
} from "./domain/attachments";
import { adjustLot, createLot } from "./domain/inventory";
import {
  addPurchaseOrderLine,
  createPurchaseOrder,
  markPurchaseOrderOrdered,
  openPoForShortages,
  receivePurchaseOrder,
} from "./domain/procurement";
import {
  allocateKitLine,
  allocateRemaining,
  cancelKit,
  createKit,
  issueKit,
  unallocateKitLine,
} from "./domain/kits";
import { importBomCsv } from "./domain/bom-csv";
import { importCatalogCsv } from "./domain/catalog-csv";
import { saveCatalogSettings } from "./domain/catalog-settings";
import {
  cancelWorkOrder,
  completeWorkOrder,
  createWorkOrder,
  openWorkOrdersForShortages,
} from "./domain/work-orders";
import { evaluateMeasurement, parseMeasured } from "./domain/measurements";
import { IDENTITY_COOKIE } from "./identity";
import { cookies } from "next/headers";
import { audited } from "./audit-action";
import {
  closeIssue,
  createIssue,
  dispositionIssue,
  reopenIssue,
} from "./domain/issues";
import path from "node:path";

const uploadsDir = path.join(process.cwd(), "data", "uploads");

// Note: a "use server" module may only export async functions, so the
// initial state lives with the client form components.
export type ActionState = {
  ok: boolean;
  error: string;
  message?: string;
};

function fail(error: string): ActionState {
  return { ok: false, error };
}

async function actor(formData: FormData, field = "by"): Promise<string> {
  const fromForm = String(formData.get(field) ?? "").trim();
  if (fromForm) return fromForm;
  return (await cookies()).get(IDENTITY_COOKIE)?.value?.trim() ?? "";
}

function optionalNumber(raw: unknown): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const nonEmpty = z.string().trim().min(1);

const ackSchema = z.object({
  runId: nonEmpty,
  by: nonEmpty,
  reason: nonEmpty,
});

export async function acknowledgeRunGaps(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("acknowledgeRunGaps", formData, () => acknowledgeRunGapsImpl(prev, formData));
}

async function acknowledgeRunGapsImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = ackSchema.safeParse({
    runId: formData.get("runId"),
    by: await actor(formData),
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
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("waiveTest", formData, () => waiveTestImpl(prev, formData));
}

async function waiveTestImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = waiverSchema.safeParse({
    runId: formData.get("runId"),
    testDefinitionId: formData.get("testDefinitionId"),
    reason: formData.get("reason"),
    approvedBy: await actor(formData, "approvedBy"),
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
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("recordTestResult", formData, () => recordTestResultImpl(prev, formData));
}

async function recordTestResultImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = testResultSchema.safeParse({
    runId: formData.get("runId"),
    testDefinitionId: formData.get("testDefinitionId"),
    status: formData.get("status"),
    value: String(formData.get("value") ?? ""),
    by: await actor(formData),
  });
  if (!parsed.success) {
    return fail("Test, a valid status (pass/fail/waived), and recorder are required.");
  }
  const { runId, testDefinitionId, value, by } = parsed.data;
  let status = parsed.data.status;

  const db = getDb();
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get();
  if (!run) return fail("Run not found.");
  const def = db
    .select()
    .from(s.testDefinitions)
    .where(eq(s.testDefinitions.id, testDefinitionId))
    .get();
  if (!def) return fail("Test definition not found.");

  let notes = "";
  const hasLimits = def.limitMin != null || def.limitMax != null;
  if (status !== "waived" && hasLimits) {
    const measured = parseMeasured(value);
    if (measured == null) {
      return fail("Enter a measured number — this test has pass/fail limits.");
    }
    const evaled = evaluateMeasurement(measured, {
      unit: def.unit,
      limitMin: def.limitMin,
      limitMax: def.limitMax,
    });
    if (evaled.status) status = evaled.status;
    notes = evaled.detail;
  }

  db.insert(s.testResults)
    .values({
      id: id("tres"),
      runId,
      testDefinitionId,
      status,
      value,
      notes,
      recordedBy: by,
    })
    .run();

  revalidatePath(`/runs/${runId}`);
  return {
    ok: true,
    error: "",
    message: notes || `Recorded ${status}.`,
  };
}

const newRunSchema = z.object({
  articleId: nonEmpty,
  standId: nonEmpty,
});

export async function createRunAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createRunAction", formData, () => createRunActionImpl(prev, formData));
}

async function createRunActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newRunSchema.safeParse({
    articleId: formData.get("articleId"),
    standId: formData.get("standId"),
  });
  if (!parsed.success) {
    return fail("Article and stand are required.");
  }

  const result = createRun(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath("/runs");
  redirect(`/runs/${result.runId}`);
}

const runLifecycleSchema = z.object({
  runId: nonEmpty,
  transition: z.enum(["start", "complete"]),
});

export async function runLifecycleAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("runLifecycleAction", formData, () => runLifecycleActionImpl(prev, formData));
}

async function runLifecycleActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = runLifecycleSchema.safeParse({
    runId: formData.get("runId"),
    transition: formData.get("transition"),
  });
  if (!parsed.success) return fail("Invalid run transition.");
  const { runId, transition } = parsed.data;

  const result =
    transition === "start"
      ? startRun(getDb(), runId)
      : completeRun(getDb(), runId);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/runs/${runId}`);
  revalidatePath("/runs");
  return { ok: true, error: "" };
}

const releaseSchema = z.object({
  configId: nonEmpty,
  by: nonEmpty,
});

export async function releaseConfig(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("releaseConfig", formData, () => releaseConfigImpl(prev, formData));
}

async function releaseConfigImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = releaseSchema.safeParse({
    configId: formData.get("configId"),
    by: await actor(formData),
  });
  if (!parsed.success) {
    return fail("Config and releaser are required.");
  }
  const supersedeBase = formData.get("supersedeBase") === "on";

  const result = releaseConfiguration(getDb(), { ...parsed.data, supersedeBase });
  if (!result.ok) return fail(result.error);

  revalidatePath(`/configs/${parsed.data.configId}`);
  revalidatePath("/configs");
  return { ok: true, error: "" };
}

export async function requestReleaseAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("requestReleaseAction", formData, () => requestReleaseActionImpl(prev, formData));
}

async function requestReleaseActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = releaseSchema.safeParse({
    configId: formData.get("configId"),
    by: await actor(formData),
  });
  if (!parsed.success) return fail("Config and requester are required.");

  const result = requestRelease(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/configs/${parsed.data.configId}`);
  revalidatePath("/configs");
  return { ok: true, error: "" };
}

const approveSchema = z.object({
  configId: nonEmpty,
  reviewer: nonEmpty,
});

export async function approveReleaseAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("approveReleaseAction", formData, () => approveReleaseActionImpl(prev, formData));
}

async function approveReleaseActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = approveSchema.safeParse({
    configId: formData.get("configId"),
    reviewer: await actor(formData, "reviewer"),
  });
  if (!parsed.success) return fail("Reviewer name is required.");
  const supersedeBase = formData.get("supersedeBase") === "on";

  const result = approveRelease(getDb(), { ...parsed.data, supersedeBase });
  if (!result.ok) return fail(result.error);

  revalidatePath(`/configs/${parsed.data.configId}`);
  revalidatePath("/configs");
  return { ok: true, error: "" };
}

export async function returnToDraftAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("returnToDraftAction", formData, () => returnToDraftActionImpl(prev, formData));
}

async function returnToDraftActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const configId = String(formData.get("configId") ?? "");
  if (!configId) return fail("Config is required.");

  const result = returnToDraft(getDb(), { configId });
  if (!result.ok) return fail(result.error);

  revalidatePath(`/configs/${configId}`);
  revalidatePath("/configs");
  return { ok: true, error: "" };
}

const cutInSchema = z.object({
  partRevisionId: nonEmpty,
  riskClass: z.enum(s.riskClasses),
});

export async function cutInRevisionAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("cutInRevisionAction", formData, () => cutInRevisionActionImpl(prev, formData));
}

async function cutInRevisionActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = cutInSchema.safeParse({
    partRevisionId: formData.get("partRevisionId"),
    riskClass: formData.get("riskClass"),
  });
  if (!parsed.success) return fail("Part revision and risk class are required.");

  const result = cutInRevision(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath("/configs");
  revalidatePath("/catalog");
  const summary = result.drafts
    .map((d) => `${d.key} (from ${d.fromKey})`)
    .join(", ");
  return {
    ok: true,
    error: "",
    message: `Created ${result.drafts.length} draft(s): ${summary}. Review effectivity and release from the Configs page.`,
  };
}

const newPartSchema = z.object({
  partNumber: nonEmpty,
  name: nonEmpty,
  category: nonEmpty,
  revision: nonEmpty,
  sourcing: z.enum(s.partSourcings),
  kind: z.enum(s.partKinds),
  description: z.string().trim(),
});

export async function createPartAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createPartAction", formData, () => createPartActionImpl(prev, formData));
}

async function createPartActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newPartSchema.safeParse({
    partNumber: formData.get("partNumber"),
    name: formData.get("name"),
    category: formData.get("category"),
    revision: formData.get("revision"),
    sourcing: formData.get("sourcing"),
    kind: formData.get("kind"),
    description: String(formData.get("description") ?? ""),
  });
  if (!parsed.success) {
    return fail("Part number, name, category, and initial revision are required.");
  }

  const result = createPart(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/catalog");
  return { ok: true, error: "" };
}

export async function deletePartsAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("deletePartsAction", formData, () => deletePartsActionImpl(prev, formData));
}

async function deletePartsActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const partIds = formData.getAll("partId").map((v) => String(v).trim()).filter(Boolean);
  const result = deleteParts(getDb(), partIds, uploadsDir);
  if (!result.ok) return fail(result.error);
  revalidatePath("/catalog");
  revalidatePath("/inventory");
  revalidatePath("/floor");
  revalidatePath("/kits");
  revalidatePath("/procurement");
  const skipped =
    result.skipped.length > 0
      ? ` Skipped ${result.skipped.length}: ${result.skipped
          .slice(0, 3)
          .map((row) => `${row.partNumber} (${row.error})`)
          .join("; ")}`
      : "";
  return {
    ok: true,
    error: "",
    message: `Deleted ${result.deleted.length} part(s).${skipped}`,
  };
}

export async function saveCatalogSettingsAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("saveCatalogSettingsAction", formData, () => saveCatalogSettingsActionImpl(prev, formData));
}

async function saveCatalogSettingsActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const categories = formData.getAll("category").map((v) => String(v));
  const prefixValues = formData.getAll("prefix");
  const lengthValues = formData.getAll("length");
  const prefixes = prefixValues.map((prefix, i) => ({
    prefix: String(prefix),
    length: Number(lengthValues[i]),
  }));
  const result = saveCatalogSettings(getDb(), { categories, prefixes });
  if (!result.ok) return fail(result.error);
  revalidatePath("/catalog");
  revalidatePath("/catalog/settings");
  return { ok: true, error: "", message: "Catalog settings saved." };
}

const attachmentTarget = z.object({
  entityType: z.enum(s.attachmentEntities),
  entityId: nonEmpty,
  by: nonEmpty,
});

function attachmentPath(entityType: string, entityId: string) {
  return entityType === "part" ? `/catalog/${entityId}` : `/configs/${entityId}`;
}

export async function addLinkAttachmentAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("addLinkAttachmentAction", formData, () => addLinkAttachmentActionImpl(prev, formData));
}

async function addLinkAttachmentActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = attachmentTarget
    .extend({ url: nonEmpty, label: z.string().trim() })
    .safeParse({
      entityType: formData.get("entityType"),
      entityId: formData.get("entityId"),
      by: await actor(formData),
      url: formData.get("url"),
      label: String(formData.get("label") ?? ""),
    });
  if (!parsed.success) return fail("A URL and your name are required.");

  const result = addLinkAttachment(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(attachmentPath(parsed.data.entityType, parsed.data.entityId));
  return { ok: true, error: "" };
}

export async function uploadFileAttachmentAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("uploadFileAttachmentAction", formData, () => uploadFileAttachmentActionImpl(prev, formData));
}

async function uploadFileAttachmentActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = attachmentTarget
    .extend({ label: z.string().trim() })
    .safeParse({
      entityType: formData.get("entityType"),
      entityId: formData.get("entityId"),
      by: await actor(formData),
      label: String(formData.get("label") ?? ""),
    });
  if (!parsed.success) return fail("A file and your name are required.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Choose a file to upload.");
  }

  const result = addFileAttachment(
    getDb(),
    {
      ...parsed.data,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
    },
    uploadsDir,
  );
  if (!result.ok) return fail(result.error);
  revalidatePath(attachmentPath(parsed.data.entityType, parsed.data.entityId));
  return { ok: true, error: "" };
}

export async function removeAttachmentAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("removeAttachmentAction", formData, () => removeAttachmentActionImpl(prev, formData));
}

async function removeAttachmentActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const attachmentId = String(formData.get("attachmentId") ?? "");
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!attachmentId) return fail("Attachment is required.");

  const result = removeAttachment(getDb(), attachmentId, uploadsDir);
  if (!result.ok) return fail(result.error);
  if (entityType && entityId) {
    revalidatePath(attachmentPath(entityType, entityId));
  }
  return { ok: true, error: "" };
}

const newRevisionSchema = z.object({
  partId: nonEmpty,
  revision: nonEmpty,
  notes: z.string().trim(),
});

export async function addPartRevisionAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("addPartRevisionAction", formData, () => addPartRevisionActionImpl(prev, formData));
}

async function addPartRevisionActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newRevisionSchema.safeParse({
    partId: formData.get("partId"),
    revision: formData.get("revision"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return fail("Part and revision are required.");

  const result = addPartRevision(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/catalog");
  return { ok: true, error: "" };
}

const newArticleSchema = z.object({ serial: nonEmpty, name: nonEmpty });

export async function createArticleAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createArticleAction", formData, () => createArticleActionImpl(prev, formData));
}

async function createArticleActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newArticleSchema.safeParse({
    serial: formData.get("serial"),
    name: formData.get("name"),
  });
  if (!parsed.success) return fail("Serial and name are required.");

  const result = createArticle(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/articles");
  return { ok: true, error: "" };
}

const newStandSchema = z.object({
  key: nonEmpty,
  name: nonEmpty,
  location: z.string().trim(),
});

export async function createStandAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createStandAction", formData, () => createStandActionImpl(prev, formData));
}

async function createStandActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newStandSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    location: String(formData.get("location") ?? ""),
  });
  if (!parsed.success) return fail("Key and name are required.");

  const result = createStand(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/stands");
  return { ok: true, error: "" };
}

const newConfigSchema = z.object({
  key: nonEmpty,
  name: nonEmpty,
  kind: z.enum(s.configKinds),
  riskClass: z.enum(s.riskClasses),
  program: z.string().trim(),
  envelope: z.string().trim(),
});

export async function createConfigAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createConfigAction", formData, () => createConfigActionImpl(prev, formData));
}

async function createConfigActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newConfigSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    riskClass: formData.get("riskClass"),
    program: String(formData.get("program") ?? ""),
    envelope: String(formData.get("envelope") ?? ""),
  });
  if (!parsed.success) {
    return fail("Key, name, kind, and risk class are required.");
  }

  const result = createConfig(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/configs");
  redirect(`/configs/${result.configId}`);
}

const asBuiltSchema = z.object({
  articleId: nonEmpty,
  partRevisionId: nonEmpty,
  qty: z.coerce.number().positive(),
  serialOrLot: z.string().trim(),
  runId: z.string().trim().optional(),
  by: z.string().trim().optional(),
});

export async function recordAsBuiltAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("recordAsBuiltAction", formData, () => recordAsBuiltActionImpl(prev, formData));
}

async function recordAsBuiltActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = asBuiltSchema.safeParse({
    articleId: formData.get("articleId"),
    partRevisionId: formData.get("partRevisionId"),
    qty: formData.get("qty"),
    serialOrLot: String(formData.get("serialOrLot") ?? ""),
    runId: String(formData.get("runId") ?? "") || undefined,
    by: (await actor(formData)) || undefined,
  });
  if (!parsed.success) {
    return fail("Part revision and a positive quantity are required.");
  }

  const result = recordAsBuilt(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/articles/${parsed.data.articleId}`);
  revalidatePath("/articles");
  revalidatePath("/inventory");
  return { ok: true, error: "" };
}

const startExecutionSchema = z.object({
  runId: nonEmpty,
  procedureId: nonEmpty,
  by: nonEmpty,
});

export async function startExecutionAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("startExecutionAction", formData, () => startExecutionActionImpl(prev, formData));
}

async function startExecutionActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = startExecutionSchema.safeParse({
    runId: formData.get("runId"),
    procedureId: formData.get("procedureId"),
    by: await actor(formData),
  });
  if (!parsed.success) return fail("Procedure and operator are required.");

  const result = startExecution(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/runs/${parsed.data.runId}`);
  redirect(`/runs/${parsed.data.runId}/execute/${result.executionId}`);
}

const recordStepSchema = z.object({
  executionId: nonEmpty,
  runId: nonEmpty,
  stepIndex: z.coerce.number().int().min(0),
  outcome: z.enum(stepOutcomes),
  value: z.string().trim(),
  note: z.string().trim(),
  by: nonEmpty,
});

export async function recordStepAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("recordStepAction", formData, () => recordStepActionImpl(prev, formData));
}

async function recordStepActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = recordStepSchema.safeParse({
    executionId: formData.get("executionId"),
    runId: formData.get("runId"),
    stepIndex: formData.get("stepIndex"),
    outcome: formData.get("outcome"),
    value: String(formData.get("value") ?? ""),
    note: String(formData.get("note") ?? ""),
    by: await actor(formData),
  });
  if (!parsed.success) return fail("Step, outcome, and operator are required.");

  const result = recordStep(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/runs/${parsed.data.runId}/execute/${parsed.data.executionId}`);
  revalidatePath(`/runs/${parsed.data.runId}`);
  return { ok: true, error: "" };
}

const abortExecutionSchema = z.object({
  executionId: nonEmpty,
  runId: nonEmpty,
  by: nonEmpty,
  reason: nonEmpty,
});

export async function abortExecutionAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("abortExecutionAction", formData, () => abortExecutionActionImpl(prev, formData));
}

async function abortExecutionActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = abortExecutionSchema.safeParse({
    executionId: formData.get("executionId"),
    runId: formData.get("runId"),
    by: await actor(formData),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return fail("An abort reason and operator are required.");

  const result = abortExecution(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/runs/${parsed.data.runId}/execute/${parsed.data.executionId}`);
  revalidatePath(`/runs/${parsed.data.runId}`);
  return { ok: true, error: "" };
}

const newProcedureSchema = z.object({
  key: nonEmpty,
  title: nonEmpty,
  body: z.string(),
});

export async function createProcedureAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createProcedureAction", formData, () => createProcedureActionImpl(prev, formData));
}

async function createProcedureActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newProcedureSchema.safeParse({
    key: formData.get("key"),
    title: formData.get("title"),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return fail("Key and title are required.");

  const result = createProcedure(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/procedures");
  return { ok: true, error: "" };
}

const reviseProcedureSchema = z.object({
  procedureId: nonEmpty,
  title: nonEmpty,
  body: z.string(),
});

export async function reviseProcedureAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("reviseProcedureAction", formData, () => reviseProcedureActionImpl(prev, formData));
}

async function reviseProcedureActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = reviseProcedureSchema.safeParse({
    procedureId: formData.get("procedureId"),
    title: formData.get("title"),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return fail("Procedure and title are required.");

  const result = reviseProcedure(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/procedures");
  return { ok: true, error: "" };
}

const newTestDefSchema = z.object({
  key: nonEmpty,
  name: nonEmpty,
  description: z.string().trim(),
  appliesTo: z.enum(["article", "stand", "either"]),
  unit: z.string().trim(),
  limitMin: z.number().nullable(),
  limitMax: z.number().nullable(),
});

export async function createTestDefinitionAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createTestDefinitionAction", formData, () => createTestDefinitionActionImpl(prev, formData));
}

async function createTestDefinitionActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newTestDefSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    appliesTo: formData.get("appliesTo"),
    unit: String(formData.get("unit") ?? ""),
    limitMin: optionalNumber(formData.get("limitMin")),
    limitMax: optionalNumber(formData.get("limitMax")),
  });
  if (!parsed.success) return fail("Key, name, and applies-to are required.");

  const result = createTestDefinition(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/procedures");
  return { ok: true, error: "" };
}

const configEditSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_bom"),
    configId: nonEmpty,
    partRevisionId: nonEmpty,
    qty: z.coerce.number().positive(),
    findNumber: z.string().trim(),
    notes: z.string().trim().optional(),
  }),
  z.object({ op: z.literal("remove_bom"), configId: nonEmpty, bomLineId: nonEmpty }),
  z.object({
    op: z.literal("update_bom"),
    configId: nonEmpty,
    bomLineId: nonEmpty,
    partRevisionId: nonEmpty,
    qty: z.coerce.number().positive(),
    findNumber: z.string().trim(),
    notes: z.string().trim().optional(),
  }),
  z.object({
    op: z.literal("add_alt"),
    configId: nonEmpty,
    bomLineId: nonEmpty,
    partRevisionId: nonEmpty,
  }),
  z.object({
    op: z.literal("remove_alt"),
    configId: nonEmpty,
    bomLineId: nonEmpty,
    partRevisionId: nonEmpty,
  }),
  z.object({
    op: z.literal("add_test"),
    configId: nonEmpty,
    testDefinitionId: nonEmpty,
  }),
  z.object({
    op: z.literal("remove_test"),
    configId: nonEmpty,
    testDefinitionId: nonEmpty,
  }),
  z.object({
    op: z.literal("add_proc"),
    configId: nonEmpty,
    procedureId: nonEmpty,
  }),
  z.object({
    op: z.literal("remove_proc"),
    configId: nonEmpty,
    procedureId: nonEmpty,
  }),
  z.object({
    op: z.literal("add_eff"),
    configId: nonEmpty,
    articleScope: z.enum(s.articleScopes),
    serialFrom: z.string().trim().optional(),
    serialTo: z.string().trim().optional(),
    standScope: z.enum(s.standScopes),
    standId: z.string().trim().optional(),
    articleIds: z.array(z.string()),
  }),
  z.object({
    op: z.literal("remove_eff"),
    configId: nonEmpty,
    effectivityId: nonEmpty,
  }),
]);

export async function configEditAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("configEditAction", formData, () => configEditActionImpl(prev, formData));
}

async function configEditActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const raw: Record<string, unknown> = {};
  for (const field of [
    "op",
    "configId",
    "partRevisionId",
    "qty",
    "findNumber",
    "notes",
    "bomLineId",
    "testDefinitionId",
    "procedureId",
    "articleScope",
    "serialFrom",
    "serialTo",
    "standScope",
    "standId",
    "effectivityId",
  ]) {
    const value = formData.get(field);
    if (value !== null) raw[field] = value;
  }
  raw.articleIds = formData.getAll("articleIds").map(String);

  const parsed = configEditSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid config edit.");
  const db = getDb();
  const input = parsed.data;

  const result = (() => {
    switch (input.op) {
      case "add_bom":
        return addBomLine(db, input);
      case "remove_bom":
        return removeBomLine(db, input);
      case "update_bom":
        return updateBomLine(db, input);
      case "add_alt":
        return addBomAlternate(db, input);
      case "remove_alt":
        return removeBomAlternate(db, input);
      case "add_test":
        return addRequiredTest(db, input);
      case "remove_test":
        return removeRequiredTest(db, input);
      case "add_proc":
        return addProcedureLink(db, input);
      case "remove_proc":
        return removeProcedureLink(db, input);
      case "add_eff":
        return addEffectivityRow(db, {
          ...input,
          explicitArticleIds: input.articleIds,
        });
      case "remove_eff":
        return removeEffectivityRow(db, input);
    }
  })();
  if (!result.ok) return fail(result.error);

  revalidatePath(`/configs/${input.configId}`);
  return { ok: true, error: "" };
}

const cutSchema = z.object({
  basedOnId: nonEmpty,
  key: nonEmpty,
  name: nonEmpty,
  riskClass: z.enum(s.riskClasses),
  program: z.string().trim(),
  envelope: z.string().trim(),
  applyLatestRevs: z.boolean(),
});

export async function cutConfigFrom(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("cutConfigFrom", formData, () => cutConfigFromImpl(prev, formData));
}

async function cutConfigFromImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = cutSchema.safeParse({
    basedOnId: formData.get("basedOnId"),
    key: formData.get("key"),
    name: formData.get("name"),
    riskClass: formData.get("riskClass"),
    program: String(formData.get("program") ?? ""),
    envelope: String(formData.get("envelope") ?? ""),
    applyLatestRevs: formData.get("applyLatestRevs") === "on",
  });
  if (!parsed.success) {
    return fail("Base config, key, name, and a valid risk class are required.");
  }

  const result = cutConfiguration(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);

  revalidatePath("/configs");
  redirect(`/configs/${result.configId}`);
}

export async function reverseAsBuiltAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("reverseAsBuiltAction", formData, () => reverseAsBuiltActionImpl(prev, formData));
}

async function reverseAsBuiltActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const asBuiltId = String(formData.get("asBuiltId") ?? "");
  const articleId = String(formData.get("articleId") ?? "");
  const by = await actor(formData);
  if (!asBuiltId || !by) return fail("Line and your name are required.");
  const result = reverseAsBuilt(getDb(), { asBuiltId, by });
  if (!result.ok) return fail(result.error);
  if (articleId) revalidatePath(`/articles/${articleId}`);
  revalidatePath("/inventory");
  revalidatePath("/floor");
  return { ok: true, error: "" };
}

export async function updatePartAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("updatePartAction", formData, () => updatePartActionImpl(prev, formData));
}

async function updatePartActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      partId: nonEmpty,
      name: nonEmpty,
      category: nonEmpty,
      sourcing: z.enum(s.partSourcings),
      kind: z.enum(s.partKinds),
      description: z.string().trim(),
    })
    .safeParse({
      partId: formData.get("partId"),
      name: formData.get("name"),
      category: formData.get("category"),
      sourcing: formData.get("sourcing"),
      kind: formData.get("kind"),
      description: String(formData.get("description") ?? ""),
    });
  if (!parsed.success) return fail("Name and category are required.");
  const result = updatePart(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/catalog");
  revalidatePath(`/catalog/${parsed.data.partId}`);
  return { ok: true, error: "" };
}

export async function createLotAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createLotAction", formData, () => createLotActionImpl(prev, formData));
}

async function createLotActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      partRevisionId: nonEmpty,
      qty: z.coerce.number().min(0),
      lotCode: nonEmpty,
      location: z.string().trim(),
      by: nonEmpty,
      reason: z.string().trim(),
    })
    .safeParse({
      partRevisionId: formData.get("partRevisionId"),
      qty: formData.get("qty"),
      lotCode: formData.get("lotCode"),
      location: String(formData.get("location") ?? ""),
      by: await actor(formData),
      reason: String(formData.get("reason") ?? ""),
    });
  if (!parsed.success) {
    return fail("Part revision, lot code, qty, and your name are required.");
  }
  const result = createLot(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/inventory");
  return { ok: true, error: "", message: "Lot created." };
}

export async function adjustLotAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("adjustLotAction", formData, () => adjustLotActionImpl(prev, formData));
}

async function adjustLotActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      lotId: nonEmpty,
      qtyDelta: z.coerce.number(),
      by: nonEmpty,
      reason: nonEmpty,
    })
    .safeParse({
      lotId: formData.get("lotId"),
      qtyDelta: formData.get("qtyDelta"),
      by: await actor(formData),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return fail("Lot, adjustment, reason, and your name are required.");
  }
  const result = adjustLot(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/inventory");
  return { ok: true, error: "", message: "Lot adjusted." };
}

export async function createPoAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createPoAction", formData, () => createPoActionImpl(prev, formData));
}

async function createPoActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      poNumber: z.string().trim(),
      supplier: nonEmpty,
      notes: z.string().trim(),
    })
    .safeParse({
      poNumber: String(formData.get("poNumber") ?? ""),
      supplier: formData.get("supplier"),
      notes: String(formData.get("notes") ?? ""),
    });
  if (!parsed.success) return fail("Supplier is required.");
  const result = createPurchaseOrder(getDb(), {
    poNumber: parsed.data.poNumber || undefined,
    supplier: parsed.data.supplier,
    notes: parsed.data.notes,
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/procurement");
  return { ok: true, error: "", message: `PO ${result.poNumber} created.` };
}

export async function addPoLineAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("addPoLineAction", formData, () => addPoLineActionImpl(prev, formData));
}

async function addPoLineActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      poId: nonEmpty,
      partRevisionId: nonEmpty,
      qty: z.coerce.number().positive(),
      unitCost: z.coerce.number().min(0),
    })
    .safeParse({
      poId: formData.get("poId"),
      partRevisionId: formData.get("partRevisionId"),
      qty: formData.get("qty"),
      unitCost: formData.get("unitCost") ?? 0,
    });
  if (!parsed.success) {
    return fail("Part revision and a positive qty are required.");
  }
  const result = addPurchaseOrderLine(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/procurement");
  return { ok: true, error: "" };
}

export async function markPoOrderedAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("markPoOrderedAction", formData, () => markPoOrderedActionImpl(prev, formData));
}

async function markPoOrderedActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const poId = String(formData.get("poId") ?? "");
  if (!poId) return fail("PO is required.");
  const result = markPurchaseOrderOrdered(getDb(), poId);
  if (!result.ok) return fail(result.error);
  revalidatePath("/procurement");
  return { ok: true, error: "" };
}

export async function receivePoAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("receivePoAction", formData, () => receivePoActionImpl(prev, formData));
}

async function receivePoActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      poId: nonEmpty,
      by: nonEmpty,
      location: z.string().trim(),
      certUrl: z.string().trim(),
      certNotes: z.string().trim(),
    })
    .safeParse({
      poId: formData.get("poId"),
      by: await actor(formData),
      location: String(formData.get("location") ?? ""),
      certUrl: String(formData.get("certUrl") ?? ""),
      certNotes: String(formData.get("certNotes") ?? ""),
    });
  if (!parsed.success) return fail("PO and your name are required to receive.");
  const result = receivePurchaseOrder(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/procurement");
  revalidatePath("/inventory");
  return { ok: true, error: "", message: "Received into stock." };
}

export async function openShortagePoAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("openShortagePoAction", formData, () => openShortagePoActionImpl(prev, formData));
}

async function openShortagePoActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({ configId: nonEmpty, supplier: nonEmpty, by: nonEmpty })
    .safeParse({
      configId: formData.get("configId"),
      supplier: formData.get("supplier"),
      by: await actor(formData),
    });
  if (!parsed.success) {
    return fail("Config, supplier, and your name are required.");
  }
  const result = openPoForShortages(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/procurement");
  revalidatePath("/change");
  redirect("/procurement");
}

export async function createKitAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createKitAction", formData, () => createKitActionImpl(prev, formData));
}

async function createKitActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      articleId: nonEmpty,
      configId: nonEmpty,
      by: nonEmpty,
      notes: z.string().trim(),
    })
    .safeParse({
      articleId: formData.get("articleId"),
      configId: formData.get("configId"),
      by: await actor(formData),
      notes: String(formData.get("notes") ?? ""),
    });
  if (!parsed.success) {
    return fail("Article, config, and your name are required.");
  }
  const result = createKit(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/kits");
  revalidatePath("/floor");
  return {
    ok: true,
    error: "",
    message: result.existing
      ? `Kit ${result.key} already exists.`
      : `Kit ${result.key} created.`,
  };
}

export async function allocateKitLineAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("allocateKitLineAction", formData, () => allocateKitLineActionImpl(prev, formData));
}

async function allocateKitLineActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      kitLineId: nonEmpty,
      lotId: nonEmpty,
      by: nonEmpty,
      kitId: nonEmpty,
    })
    .safeParse({
      kitLineId: formData.get("kitLineId"),
      lotId: formData.get("lotId"),
      by: await actor(formData),
      kitId: formData.get("kitId"),
    });
  if (!parsed.success) return fail("Lot and your name are required.");
  const result = allocateKitLine(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/kits/${parsed.data.kitId}`);
  revalidatePath("/inventory");
  return { ok: true, error: "" };
}

export async function unallocateKitLineAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("unallocateKitLineAction", formData, () => unallocateKitLineActionImpl(prev, formData));
}

async function unallocateKitLineActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      kitLineId: nonEmpty,
      by: nonEmpty,
      kitId: nonEmpty,
    })
    .safeParse({
      kitLineId: formData.get("kitLineId"),
      by: await actor(formData),
      kitId: formData.get("kitId"),
    });
  if (!parsed.success) return fail("Your name is required to unallocate.");
  const result = unallocateKitLine(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/kits/${parsed.data.kitId}`);
  revalidatePath("/inventory");
  return { ok: true, error: "" };
}

export async function allocateRemainingAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("allocateRemainingAction", formData, () => allocateRemainingActionImpl(prev, formData));
}

async function allocateRemainingActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({ kitId: nonEmpty, by: nonEmpty })
    .safeParse({
      kitId: formData.get("kitId"),
      by: await actor(formData),
    });
  if (!parsed.success) return fail("Your name is required to allocate.");
  const result = allocateRemaining(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/kits/${parsed.data.kitId}`);
  revalidatePath("/inventory");
  revalidatePath("/floor");
  const skipped =
    result.skipped > 0 ? ` (${result.skipped} line(s) still short)` : "";
  return {
    ok: true,
    error: "",
    message: `Allocated ${result.allocated} line(s)${skipped}.`,
  };
}

export async function issueKitAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("issueKitAction", formData, () => issueKitActionImpl(prev, formData));
}

async function issueKitActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({ kitId: nonEmpty, by: nonEmpty, articleId: z.string().trim() })
    .safeParse({
      kitId: formData.get("kitId"),
      by: await actor(formData),
      articleId: String(formData.get("articleId") ?? ""),
    });
  if (!parsed.success) return fail("Your name is required to issue.");
  const result = issueKit(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/kits/${parsed.data.kitId}`);
  revalidatePath("/inventory");
  revalidatePath("/floor");
  if (parsed.data.articleId) {
    revalidatePath(`/articles/${parsed.data.articleId}`);
  }
  return { ok: true, error: "", message: "Kit issued — as-built stamped." };
}

export async function cancelKitAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("cancelKitAction", formData, () => cancelKitActionImpl(prev, formData));
}

async function cancelKitActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({ kitId: nonEmpty, by: nonEmpty })
    .safeParse({
      kitId: formData.get("kitId"),
      by: await actor(formData),
    });
  if (!parsed.success) return fail("Your name is required to cancel.");
  const result = cancelKit(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/kits/${parsed.data.kitId}`);
  revalidatePath("/kits");
  revalidatePath("/inventory");
  revalidatePath("/floor");
  return { ok: true, error: "", message: "Kit cancelled." };
}

export async function importBomCsvAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("importBomCsvAction", formData, () => importBomCsvActionImpl(prev, formData));
}

async function importBomCsvActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const configId = String(formData.get("configId") ?? "");
  if (!configId) return fail("Config is required.");
  const file = formData.get("file");
  let csv = String(formData.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    csv = await file.text();
  }
  if (!csv.trim()) return fail("Paste CSV or choose a file.");
  const result = importBomCsv(getDb(), { configId, csv });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/configs/${configId}`);
  return {
    ok: true,
    error: "",
    message: `Imported ${result.added} new pin(s), updated ${result.updated}.`,
  };
}

export async function importCatalogCsvAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("importCatalogCsvAction", formData, () => importCatalogCsvActionImpl(prev, formData));
}

async function importCatalogCsvActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const file = formData.get("file");
  let csv = String(formData.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    csv = await file.text();
  }
  if (!csv.trim()) return fail("Paste CSV or choose a file.");
  const result = importCatalogCsv(getDb(), csv);
  if (!result.ok) return fail(result.error);
  revalidatePath("/catalog");
  const skipped =
    result.skipped.length > 0
      ? ` Skipped ${result.skipped.length}: ${result.skipped.slice(0, 3).join("; ")}`
      : "";
  return {
    ok: true,
    error: "",
    message: `Imported ${result.added} part(s).${skipped}`,
  };
}

export async function createWorkOrderAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createWorkOrderAction", formData, () => createWorkOrderActionImpl(prev, formData));
}

async function createWorkOrderActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      partRevisionId: nonEmpty,
      qty: z.coerce.number().positive(),
      by: nonEmpty,
      location: z.string().trim(),
      lotCode: z.string().trim(),
      notes: z.string().trim(),
    })
    .safeParse({
      partRevisionId: formData.get("partRevisionId"),
      qty: formData.get("qty"),
      by: await actor(formData),
      location: String(formData.get("location") ?? ""),
      lotCode: String(formData.get("lotCode") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
  if (!parsed.success) {
    return fail("Make-part revision, quantity, and your name are required.");
  }
  const result = createWorkOrder(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/inventory");
  return { ok: true, error: "", message: `${result.key} opened.` };
}

export async function completeWorkOrderAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("completeWorkOrderAction", formData, () => completeWorkOrderActionImpl(prev, formData));
}

async function completeWorkOrderActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({
      workOrderId: nonEmpty,
      by: nonEmpty,
      lotCode: z.string().trim(),
      location: z.string().trim(),
    })
    .safeParse({
      workOrderId: formData.get("workOrderId"),
      by: await actor(formData),
      lotCode: String(formData.get("lotCode") ?? ""),
      location: String(formData.get("location") ?? ""),
    });
  if (!parsed.success) return fail("Work order and your name are required.");
  const result = completeWorkOrder(getDb(), {
    workOrderId: parsed.data.workOrderId,
    by: parsed.data.by,
    lotCode: parsed.data.lotCode || undefined,
    location: parsed.data.location || undefined,
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/inventory");
  return { ok: true, error: "", message: "Work order complete — lot in stock." };
}

export async function cancelWorkOrderAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("cancelWorkOrderAction", formData, () => cancelWorkOrderActionImpl(prev, formData));
}

async function cancelWorkOrderActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({ workOrderId: nonEmpty, by: nonEmpty })
    .safeParse({
      workOrderId: formData.get("workOrderId"),
      by: await actor(formData),
    });
  if (!parsed.success) return fail("Work order and your name are required.");
  const result = cancelWorkOrder(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/inventory");
  return { ok: true, error: "", message: "Work order cancelled." };
}

export async function openShortageWoAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("openShortageWoAction", formData, () => openShortageWoActionImpl(prev, formData));
}

async function openShortageWoActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = z
    .object({ configId: nonEmpty, by: nonEmpty })
    .safeParse({
      configId: formData.get("configId"),
      by: await actor(formData),
    });
  if (!parsed.success) return fail("Config and your name are required.");
  const result = openWorkOrdersForShortages(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/inventory");
  revalidatePath("/floor");
  revalidatePath("/change");
  const summary = result.created
    .map((c) => `${c.key} ${c.partNumber} × ${c.qty}`)
    .join(", ");
  return {
    ok: true,
    error: "",
    message: `Opened ${result.created.length} work order(s): ${summary}.`,
  };
}

export async function createAndPinTestAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createAndPinTestAction", formData, () => createAndPinTestActionImpl(prev, formData));
}

async function createAndPinTestActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const configId = String(formData.get("configId") ?? "");
  if (!configId) return fail("Config is required.");
  const parsed = newTestDefSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    appliesTo: formData.get("appliesTo") || "article",
    unit: String(formData.get("unit") ?? ""),
    limitMin: optionalNumber(formData.get("limitMin")),
    limitMax: optionalNumber(formData.get("limitMax")),
  });
  if (!parsed.success) return fail("Key and name are required.");
  const db = getDb();
  const created = createTestDefinition(db, parsed.data);
  if (!created.ok) return fail(created.error);
  const linked = addRequiredTest(db, {
    configId,
    testDefinitionId: created.testDefinitionId,
  });
  if (!linked.ok) return fail(linked.error);
  revalidatePath(`/configs/${configId}`);
  revalidatePath("/procedures");
  return { ok: true, error: "", message: `Pinned ${parsed.data.key}.` };
}

export async function createAndPinProcedureAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createAndPinProcedureAction", formData, () => createAndPinProcedureActionImpl(prev, formData));
}

async function createAndPinProcedureActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const configId = String(formData.get("configId") ?? "");
  if (!configId) return fail("Config is required.");
  const parsed = newProcedureSchema.safeParse({
    key: formData.get("key"),
    title: formData.get("title"),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return fail("Key and title are required.");
  const db = getDb();
  const created = createProcedure(db, parsed.data);
  if (!created.ok) return fail(created.error);
  const linked = addProcedureLink(db, {
    configId,
    procedureId: created.procedureId,
  });
  if (!linked.ok) return fail(linked.error);
  revalidatePath(`/configs/${configId}`);
  revalidatePath("/procedures");
  return { ok: true, error: "", message: `Linked ${parsed.data.key}.` };
}

export async function createIssueAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("createIssueAction", formData, () =>
    createIssueActionImpl(prev, formData),
  );
}

async function createIssueActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const result = createIssue(getDb(), {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    severity: String(formData.get("severity") ?? "minor"),
    reportedBy: await actor(formData),
    articleId: String(formData.get("articleId") ?? "") || null,
    partRevisionId: String(formData.get("partRevisionId") ?? "") || null,
    lotId: String(formData.get("lotId") ?? "") || null,
    runId: String(formData.get("runId") ?? "") || null,
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/issues");
  redirect(`/issues/${result.issueId}`);
}

export async function dispositionIssueAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("dispositionIssueAction", formData, () =>
    dispositionIssueActionImpl(prev, formData),
  );
}

async function dispositionIssueActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const issueId = String(formData.get("issueId") ?? "");
  const result = dispositionIssue(getDb(), {
    issueId,
    disposition: String(formData.get("disposition") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    by: await actor(formData),
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  return { ok: true, error: "" };
}

export async function closeIssueAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("closeIssueAction", formData, () =>
    closeIssueActionImpl(prev, formData),
  );
}

async function closeIssueActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const issueId = String(formData.get("issueId") ?? "");
  const result = closeIssue(getDb(), {
    issueId,
    by: await actor(formData),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  return { ok: true, error: "" };
}

export async function reopenIssueAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return audited("reopenIssueAction", formData, () =>
    reopenIssueActionImpl(prev, formData),
  );
}

async function reopenIssueActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const issueId = String(formData.get("issueId") ?? "");
  const result = reopenIssue(getDb(), {
    issueId,
    by: await actor(formData),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  return { ok: true, error: "" };
}
