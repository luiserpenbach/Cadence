import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import { makeConfig } from "../../test/fixtures";
import { nextVersion } from "../version";
import {
  createProcedure,
  createTestDefinition,
  reviseProcedure,
} from "./procedures";

describe("nextVersion", () => {
  it("increments spreadsheet-style", () => {
    expect(nextVersion("A")).toBe("B");
    expect(nextVersion("Y")).toBe("Z");
    expect(nextVersion("Z")).toBe("AA");
    expect(nextVersion("AZ")).toBe("BA");
  });
});

describe("procedures & test definitions", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("creates procedures and rejects duplicate keys", () => {
    expect(createProcedure(db, { key: "PROC-1", title: "T", body: "" }).ok).toBe(true);
    expect(createProcedure(db, { key: "PROC-1", title: "U", body: "" }).ok).toBe(false);
  });

  it("creates test definitions and rejects duplicate keys", () => {
    expect(
      createTestDefinition(db, {
        key: "TST-1",
        name: "Leak",
        description: "",
        appliesTo: "article",
      }).ok,
    ).toBe(true);
    expect(
      createTestDefinition(db, {
        key: "TST-1",
        name: "Other",
        description: "",
        appliesTo: "stand",
      }).ok,
    ).toBe(false);
  });

  it("stores unit and pass/fail limits on a test definition", () => {
    expect(
      createTestDefinition(db, {
        key: "THRUST",
        name: "Thrust",
        description: "",
        appliesTo: "article",
        unit: "N",
        limitMin: 47,
        limitMax: 53,
      }).ok,
    ).toBe(true);
    const stored = db.select().from(s.testDefinitions).all()[0];
    expect(stored).toMatchObject({ unit: "N", limitMin: 47, limitMax: 53 });
  });

  it("revising keeps the old version row and bumps the version", () => {
    const created = createProcedure(db, {
      key: "PROC-1",
      title: "Purge",
      body: "old text",
    });
    if (!created.ok) throw new Error("setup");

    const revised = reviseProcedure(db, {
      procedureId: created.procedureId,
      title: "Purge",
      body: "new text",
    });
    expect(revised).toMatchObject({ ok: true, version: "B" });

    const rows = db
      .select()
      .from(s.procedures)
      .where(eq(s.procedures.key, "PROC-1"))
      .all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.version).sort()).toEqual(["A", "B"]);
    expect(rows.find((r) => r.version === "A")!.body).toBe("old text");
  });

  it("draft configs move to the new version; released configs keep theirs", () => {
    const created = createProcedure(db, {
      key: "PROC-1",
      title: "Purge",
      body: "old",
    });
    if (!created.ok) throw new Error("setup");
    const oldId = created.procedureId;

    const draftId = makeConfig(db, "CFG-DRAFT");
    const releasedId = makeConfig(db, "CFG-REL", { status: "released" });
    for (const configId of [draftId, releasedId]) {
      db.insert(s.configProcedures)
        .values({ id: id("cpr"), configId, procedureId: oldId })
        .run();
    }

    const revised = reviseProcedure(db, {
      procedureId: oldId,
      title: "Purge",
      body: "new",
    });
    if (!revised.ok) throw new Error("revise failed");

    const links = db.select().from(s.configProcedures).all();
    const draftLink = links.find((l) => l.configId === draftId)!;
    const releasedLink = links.find((l) => l.configId === releasedId)!;
    expect(draftLink.procedureId).toBe(revised.procedureId);
    expect(releasedLink.procedureId).toBe(oldId);
  });

  it("revising the latest version chains B → C", () => {
    const created = createProcedure(db, { key: "PROC-1", title: "T", body: "" });
    if (!created.ok) throw new Error("setup");
    const b = reviseProcedure(db, {
      procedureId: created.procedureId,
      title: "T",
      body: "b",
    });
    if (!b.ok) throw new Error("revise failed");
    // revising from the OLD row still lands on the next free version
    const c = reviseProcedure(db, {
      procedureId: created.procedureId,
      title: "T",
      body: "c",
    });
    expect(c).toMatchObject({ ok: true, version: "C" });
  });
});
