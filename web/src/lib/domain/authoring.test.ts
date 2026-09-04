import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import {
  createArticle,
  createConfig,
  createPart,
  createStand,
  addPartRevision,
  deleteParts,
} from "./authoring";
import { addBomLine } from "./config-edit";

describe("catalog authoring", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("creates a part with its initial revision", () => {
    const result = createPart(db, {
      partNumber: "VLV-001",
      name: "Valve",
      category: "valve",
      revision: "A",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const revs = db
      .select()
      .from(s.partRevisions)
      .where(eq(s.partRevisions.partId, result.partId))
      .all();
    expect(revs).toHaveLength(1);
    expect(revs[0].revision).toBe("A");
  });

  it("rejects duplicate part numbers", () => {
    createPart(db, { partNumber: "VLV-001", name: "V", category: "c", revision: "A" });
    const dup = createPart(db, {
      partNumber: "VLV-001",
      name: "Other",
      category: "c",
      revision: "A",
    });
    expect(dup.ok).toBe(false);
    expect(db.select().from(s.parts).all()).toHaveLength(1);
  });

  it("adds revisions and rejects duplicates per part", () => {
    const part = createPart(db, {
      partNumber: "VLV-001",
      name: "V",
      category: "c",
      revision: "A",
    });
    if (!part.ok) throw new Error("setup");
    expect(
      addPartRevision(db, { partId: part.partId, revision: "B", notes: "" }).ok,
    ).toBe(true);
    expect(
      addPartRevision(db, { partId: part.partId, revision: "B", notes: "" }).ok,
    ).toBe(false);
  });

  it("rejects duplicate article serials, stand keys, and config keys", () => {
    expect(createArticle(db, { serial: "TP-001", name: "x" }).ok).toBe(true);
    expect(createArticle(db, { serial: "TP-001", name: "y" }).ok).toBe(false);

    expect(createStand(db, { key: "STAND-B", name: "x", location: "" }).ok).toBe(true);
    expect(createStand(db, { key: "STAND-B", name: "y", location: "" }).ok).toBe(false);

    expect(
      createConfig(db, { key: "CFG-1", name: "x", kind: "article", riskClass: "R1" }).ok,
    ).toBe(true);
    expect(
      createConfig(db, { key: "CFG-1", name: "y", kind: "stand", riskClass: "R1" }).ok,
    ).toBe(false);
  });

  it("new configs start as empty drafts", () => {
    const result = createConfig(db, {
      key: "CFG-1",
      name: "New",
      kind: "article",
      riskClass: "R2",
    });
    if (!result.ok) throw new Error("setup");
    const config = db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, result.configId))
      .get()!;
    expect(config.status).toBe("draft");
    expect(
      db
        .select()
        .from(s.configBomLines)
        .where(eq(s.configBomLines.configId, result.configId))
        .all(),
    ).toHaveLength(0);
  });

  it("deletes unused parts and keeps referenced ones", () => {
    const unused = createPart(db, {
      partNumber: "SPARE-001",
      name: "Spare",
      category: "c",
      revision: "A",
    });
    const used = createPart(db, {
      partNumber: "VLV-001",
      name: "Valve",
      category: "c",
      revision: "A",
    });
    if (!unused.ok || !used.ok) throw new Error("setup");
    const rev = db
      .select()
      .from(s.partRevisions)
      .where(eq(s.partRevisions.partId, used.partId))
      .get()!;
    const config = createConfig(db, {
      key: "CFG-DEL",
      name: "Del",
      kind: "article",
      riskClass: "R1",
    });
    if (!config.ok) throw new Error("setup");
    expect(
      addBomLine(db, {
        configId: config.configId,
        partRevisionId: rev.id,
        qty: 1,
        findNumber: "1",
      }).ok,
    ).toBe(true);

    const result = deleteParts(db, [unused.partId, used.partId]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deleted).toEqual(["SPARE-001"]);
    expect(result.skipped[0]?.partNumber).toBe("VLV-001");
    expect(result.skipped[0]?.error).toMatch(/BOM/i);
    expect(db.select().from(s.parts).all().map((p) => p.partNumber)).toEqual([
      "VLV-001",
    ]);
  });

  it("deletes a part that is not referenced anywhere", () => {
    const part = createPart(db, {
      partNumber: "SPARE-001",
      name: "Spare",
      category: "c",
      revision: "A",
    });
    if (!part.ok) throw new Error("setup");
    expect(deleteParts(db, [part.partId]).ok).toBe(true);
    expect(db.select().from(s.parts).all()).toHaveLength(0);
    expect(db.select().from(s.partRevisions).all()).toHaveLength(0);
  });
});
