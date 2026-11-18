import { cookies } from "next/headers";
import { getDb } from "../db";
import { recordAudit, summarizeAction } from "./domain/audit";
import { IDENTITY_COOKIE } from "./identity";

type Result = { ok: boolean; error: string; message?: string };

function fieldsOf(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string" || k.startsWith("$")) continue;
    out[k] = out[k] ? `${out[k]} ${v}` : v;
  }
  return out;
}

function redirectTarget(e: unknown): string | null {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) {
    return null;
  }
  return digest;
}

// Wraps a server action so every successful write lands in the audit log.
// A redirect counts as success (actions redirect only after committing).
// Logging can never fail the action it describes.
export async function audited<T extends Result>(
  action: string,
  formData: FormData,
  run: () => Promise<T>,
): Promise<T> {
  const write = async (extra = "") => {
    try {
      const fields = fieldsOf(formData);
      const actor =
        fields.by?.trim() ||
        fields.approvedBy?.trim() ||
        (await cookies()).get(IDENTITY_COOKIE)?.value?.trim() ||
        "";
      const db = getDb();
      const { summary, refs } = summarizeAction(db, action, fields, extra);
      recordAudit(db, { actor, action, summary, refs });
    } catch (err) {
      console.error(`audit: failed to record ${action}`, err);
    }
  };

  try {
    const result = await run();
    if (result.ok) await write(result.message ?? "");
    return result;
  } catch (e) {
    const target = redirectTarget(e);
    if (target) await write(target);
    throw e;
  }
}
