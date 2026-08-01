import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import type { AttachmentEntity } from "../../db/schema";
import { id } from "../id";

export type AttachmentResult =
  | { ok: true; attachmentId: string }
  | { ok: false; error: string };

function entityExists(db: Db, entityType: AttachmentEntity, entityId: string) {
  if (entityType === "part") {
    return Boolean(
      db.select({ id: s.parts.id }).from(s.parts).where(eq(s.parts.id, entityId)).get(),
    );
  }
  return Boolean(
    db
      .select({ id: s.configurations.id })
      .from(s.configurations)
      .where(eq(s.configurations.id, entityId))
      .get(),
  );
}

export function addLinkAttachment(
  db: Db,
  input: {
    entityType: AttachmentEntity;
    entityId: string;
    label: string;
    url: string;
    by: string;
  },
): AttachmentResult {
  if (!entityExists(db, input.entityType, input.entityId)) {
    return { ok: false, error: "Attachment target not found." };
  }
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http(s) links are supported." };
  }

  const attachmentId = id("att");
  db.insert(s.attachments)
    .values({
      id: attachmentId,
      entityType: input.entityType,
      entityId: input.entityId,
      kind: "link",
      label: input.label.trim() || parsed.hostname,
      url: input.url,
      addedBy: input.by,
    })
    .run();
  return { ok: true, attachmentId };
}

// Files live on disk under the storage dir, named by attachment id so disk
// names never collide or leak user input; the original name is metadata.
export function addFileAttachment(
  db: Db,
  input: {
    entityType: AttachmentEntity;
    entityId: string;
    label: string;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
    by: string;
  },
  storageDir: string,
): AttachmentResult {
  if (!entityExists(db, input.entityType, input.entityId)) {
    return { ok: false, error: "Attachment target not found." };
  }
  if (input.bytes.length === 0) {
    return { ok: false, error: "Empty file." };
  }
  const safeName = path.basename(input.fileName).replace(/[^\w.\-]+/g, "_");
  if (!safeName) return { ok: false, error: "A file name is required." };

  const attachmentId = id("att");
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, attachmentId), input.bytes);

  db.insert(s.attachments)
    .values({
      id: attachmentId,
      entityType: input.entityType,
      entityId: input.entityId,
      kind: "file",
      label: input.label.trim() || safeName,
      fileName: safeName,
      mimeType: input.mimeType,
      addedBy: input.by,
    })
    .run();
  return { ok: true, attachmentId };
}

export function removeAttachment(
  db: Db,
  attachmentId: string,
  storageDir: string,
): { ok: true } | { ok: false; error: string } {
  const attachment = db
    .select()
    .from(s.attachments)
    .where(eq(s.attachments.id, attachmentId))
    .get();
  if (!attachment) return { ok: false, error: "Attachment not found." };

  db.delete(s.attachments).where(eq(s.attachments.id, attachmentId)).run();
  if (attachment.kind === "file") {
    try {
      fs.unlinkSync(path.join(storageDir, attachment.id));
    } catch {
      // row removal is the source of truth; a missing file is not an error
    }
  }
  return { ok: true };
}

export function listAttachments(
  db: Db,
  entityType: AttachmentEntity,
  entityId: string,
) {
  return db
    .select()
    .from(s.attachments)
    .all()
    .filter((a) => a.entityType === entityType && a.entityId === entityId);
}
