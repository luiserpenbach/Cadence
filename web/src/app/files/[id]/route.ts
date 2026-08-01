import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import * as s from "../../../db/schema";
import { ensureAppData } from "../../../lib/bootstrap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureAppData();
  const { id } = await params;
  const attachment = getDb()
    .select()
    .from(s.attachments)
    .where(eq(s.attachments.id, id))
    .get();
  if (!attachment) return new Response("Not found", { status: 404 });

  if (attachment.kind === "link") {
    return Response.redirect(attachment.url, 302);
  }

  const filePath = path.join(process.cwd(), "data", "uploads", attachment.id);
  if (!fs.existsSync(filePath)) {
    return new Response("File missing from storage", { status: 404 });
  }
  const bytes = fs.readFileSync(filePath);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${attachment.fileName}"`,
    },
  });
}
