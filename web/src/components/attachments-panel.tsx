import { Badge } from "./ui";
import {
  AttachmentForms,
  RemoveAttachmentButton,
} from "./authoring-forms";
import { getDb } from "../db";
import { listAttachments } from "../lib/domain/attachments";
import type { AttachmentEntity } from "../db/schema";

// Server component: attachment list + add forms for a part or configuration.
export function AttachmentsPanel({
  entityType,
  entityId,
}: {
  entityType: AttachmentEntity;
  entityId: string;
}) {
  const attachments = listAttachments(getDb(), entityType, entityId);

  return (
    <div>
      <ul className="space-y-2 text-sm">
        {attachments.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--panel-strong)] px-3 py-2"
          >
            <Badge tone={a.kind === "file" ? "accent" : "neutral"}>
              {a.kind}
            </Badge>
            <a
              href={`/files/${a.id}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {a.label}
            </a>
            {a.kind === "file" && a.fileName !== a.label ? (
              <span className="font-mono text-xs text-[var(--muted)]">
                {a.fileName}
              </span>
            ) : null}
            <span className="ml-auto text-xs text-[var(--muted)]">
              {a.addedBy} · {a.createdAt}
            </span>
            <RemoveAttachmentButton
              attachmentId={a.id}
              entityType={entityType}
              entityId={entityId}
            />
          </li>
        ))}
        {attachments.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            No attachments — link a drawing or upload a datasheet.
          </li>
        ) : null}
      </ul>
      <AttachmentForms entityType={entityType} entityId={entityId} />
    </div>
  );
}
