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
} from "./domain/authoring";
import {
  addBomLine,
  addEffectivityRow,
  addProcedureLink,
  addRequiredTest,
  removeBomLine,
  removeEffectivityRow,
  removeProcedureLink,
  removeRequiredTest,
  updateBomLine,
} from "./domain/config-edit";
import { recordAsBuilt } from "./domain/asbuilt";
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

const newRunSchema = z.object({
  articleId: nonEmpty,
  standId: nonEmpty,
});

export async function createRunAction(
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
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = releaseSchema.safeParse({
    configId: formData.get("configId"),
    by: formData.get("by"),
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
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = releaseSchema.safeParse({
    configId: formData.get("configId"),
    by: formData.get("by"),
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
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = approveSchema.safeParse({
    configId: formData.get("configId"),
    reviewer: formData.get("reviewer"),
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
});

export async function createPartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newPartSchema.safeParse({
    partNumber: formData.get("partNumber"),
    name: formData.get("name"),
    category: formData.get("category"),
    revision: formData.get("revision"),
  });
  if (!parsed.success) {
    return fail("Part number, name, category, and initial revision are required.");
  }

  const result = createPart(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/catalog");
  return { ok: true, error: "" };
}

const newRevisionSchema = z.object({
  partId: nonEmpty,
  revision: nonEmpty,
  notes: z.string().trim(),
});

export async function addPartRevisionAction(
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
});

export async function createConfigAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newConfigSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    riskClass: formData.get("riskClass"),
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
});

export async function recordAsBuiltAction(
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
  });
  if (!parsed.success) {
    return fail("Part revision and a positive quantity are required.");
  }

  const result = recordAsBuilt(getDb(), parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/articles/${parsed.data.articleId}`);
  revalidatePath("/articles");
  return { ok: true, error: "" };
}

const startExecutionSchema = z.object({
  runId: nonEmpty,
  procedureId: nonEmpty,
  by: nonEmpty,
});

export async function startExecutionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = startExecutionSchema.safeParse({
    runId: formData.get("runId"),
    procedureId: formData.get("procedureId"),
    by: formData.get("by"),
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
    by: formData.get("by"),
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
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = abortExecutionSchema.safeParse({
    executionId: formData.get("executionId"),
    runId: formData.get("runId"),
    by: formData.get("by"),
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
});

export async function createTestDefinitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  ensureAppData();
  const parsed = newTestDefSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    appliesTo: formData.get("appliesTo"),
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
  }),
  z.object({ op: z.literal("remove_bom"), configId: nonEmpty, bomLineId: nonEmpty }),
  z.object({
    op: z.literal("update_bom"),
    configId: nonEmpty,
    bomLineId: nonEmpty,
    partRevisionId: nonEmpty,
    qty: z.coerce.number().positive(),
    findNumber: z.string().trim(),
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
