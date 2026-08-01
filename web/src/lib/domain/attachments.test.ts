import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { makeConfig, makePart } from "../../test/fixtures";
import { createPart } from "./authoring";
import {
  addFileAttachment,
  addLinkAttachment,
  listAttachments,
  removeAttachment,
} from "./attachments";

describe("part sourcing and kind", () => {
  it("stores make/buy and component/assembly, with defaults", () => {
    const db = createTestDb();
    const made = createPart(db, {
      partNumber: "MNF-1",
      name: "Manifold",
      category: "structure",
      revision: "A",
      sourcing: "make",
      kind: "assembly",
    });
    if (!made.ok) throw new Error(made.error);
    const bought = createPart(db, {
      partNumber: "SNS-1",
      name: "Sensor",
      category: "sensor",
      revision: "A",
    });
    if (!bought.ok) throw new Error(bought.error);

    const parts = db.select().from(s.parts).all();
    const manifold = parts.find((p) => p.partNumber === "MNF-1")!;
    expect(manifold).toMatchObject({ sourcing: "make", kind: "assembly" });
    const sensor = parts.find((p) => p.partNumber === "SNS-1")!;
    expect(sensor).toMatchObject({ sourcing: "buy", kind: "component" });
  });
});

describe("attachments", () => {
  let db: Db;
  let partId: string;
  let storageDir: string;

  beforeEach(() => {
    db = createTestDb();
    partId = makePart(db, "VLV-001").partId;
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cadence-uploads-"));
  });

  afterEach(() => {
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it("adds link attachments with URL validation", () => {
    const good = addLinkAttachment(db, {
      entityType: "part",
      entityId: partId,
      label: "Drawing",
      url: "https://example.com/d.pdf",
      by: "m.chen",
    });
    expect(good.ok).toBe(true);

    expect(
      addLinkAttachment(db, {
        entityType: "part",
        entityId: partId,
        label: "",
        url: "not a url",
        by: "x",
      }).ok,
    ).toBe(false);
    expect(
      addLinkAttachment(db, {
        entityType: "part",
        entityId: partId,
        label: "",
        url: "javascript:alert(1)",
        by: "x",
      }).ok,
    ).toBe(false);
    expect(
      addLinkAttachment(db, {
        entityType: "part",
        entityId: "nope",
        label: "",
        url: "https://example.com",
        by: "x",
      }).ok,
    ).toBe(false);

    expect(listAttachments(db, "part", partId)).toHaveLength(1);
  });

  it("stores files under the attachment id and sanitizes names", () => {
    const result = addFileAttachment(
      db,
      {
        entityType: "part",
        entityId: partId,
        label: "",
        fileName: "../..//weird name!.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("PDF-BYTES"),
        by: "m.chen",
      },
      storageDir,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = fs.readFileSync(path.join(storageDir, result.attachmentId));
    expect(stored.toString()).toBe("PDF-BYTES");

    const row = listAttachments(db, "part", partId)[0];
    expect(row.fileName).toBe("weird_name_.pdf");
    expect(row.label).toBe("weird_name_.pdf"); // label defaults to file name
    expect(row.kind).toBe("file");
  });

  it("rejects empty files", () => {
    expect(
      addFileAttachment(
        db,
        {
          entityType: "part",
          entityId: partId,
          label: "",
          fileName: "x.bin",
          mimeType: "",
          bytes: Buffer.alloc(0),
          by: "x",
        },
        storageDir,
      ).ok,
    ).toBe(false);
  });

  it("attaches to configurations too, and lists are scoped per entity", () => {
    const configId = makeConfig(db, "CFG-1");
    addLinkAttachment(db, {
      entityType: "configuration",
      entityId: configId,
      label: "Release report",
      url: "https://example.com/r.pdf",
      by: "m.chen",
    });
    expect(listAttachments(db, "configuration", configId)).toHaveLength(1);
    expect(listAttachments(db, "part", partId)).toHaveLength(0);
  });

  it("remove deletes the row and the stored file", () => {
    const added = addFileAttachment(
      db,
      {
        entityType: "part",
        entityId: partId,
        label: "Cert",
        fileName: "cert.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("bytes"),
        by: "m.chen",
      },
      storageDir,
    );
    if (!added.ok) throw new Error(added.error);
    const filePath = path.join(storageDir, added.attachmentId);
    expect(fs.existsSync(filePath)).toBe(true);

    expect(removeAttachment(db, added.attachmentId, storageDir).ok).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(listAttachments(db, "part", partId)).toHaveLength(0);
    expect(removeAttachment(db, added.attachmentId, storageDir).ok).toBe(false);
  });
});
