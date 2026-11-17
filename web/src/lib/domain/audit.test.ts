import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { makeArticle, makeConfig } from "../../test/fixtures";
import {
  actionLabel,
  listAudit,
  recordAudit,
  summarizeAction,
  verifyAuditChain,
} from "./audit";

describe("audit log", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it("chains each event to the one before it", () => {
    const a = recordAudit(db, { actor: "m.chen", action: "x", summary: "one" });
    const b = recordAudit(db, { actor: "m.chen", action: "y", summary: "two" });
    expect(a.prevHash).toBe("");
    expect(b.prevHash).toBe(a.hash);
    expect(verifyAuditChain(db)).toEqual({ ok: true, count: 2 });
  });

  it("detects an edited event", () => {
    recordAudit(db, { actor: "a", action: "x", summary: "one" });
    const target = recordAudit(db, { actor: "a", action: "x", summary: "two" });
    recordAudit(db, { actor: "a", action: "x", summary: "three" });
    db.update(s.auditEvents)
      .set({ actor: "someone.else" })
      .where(eq(s.auditEvents.seq, target.seq))
      .run();
    expect(verifyAuditChain(db)).toEqual({
      ok: false,
      count: 3,
      brokenAtSeq: target.seq,
    });
  });

  it("detects a deleted event", () => {
    recordAudit(db, { actor: "a", action: "x", summary: "one" });
    const target = recordAudit(db, { actor: "a", action: "x", summary: "two" });
    const after = recordAudit(db, { actor: "a", action: "x", summary: "three" });
    db.delete(s.auditEvents).where(eq(s.auditEvents.seq, target.seq)).run();
    const status = verifyAuditChain(db);
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.brokenAtSeq).toBe(after.seq);
  });

  it("filters by touched record without matching id prefixes", () => {
    recordAudit(db, { actor: "a", action: "x", summary: "one", refs: ["cfg_aaaaaaaaaa"] });
    recordAudit(db, {
      actor: "b",
      action: "x",
      summary: "two",
      refs: ["cfg_aaaaaaaaaab", "run_bbbbbbbbbb"],
    });
    expect(listAudit(db, { ref: "cfg_aaaaaaaaaa" }).map((e) => e.summary)).toEqual([
      "one",
    ]);
    expect(listAudit(db, { ref: "run_bbbbbbbbbb" })).toHaveLength(1);
    expect(listAudit(db, { q: "tw" })).toHaveLength(1);
    expect(listAudit(db).map((e) => e.summary)).toEqual(["two", "one"]);
  });

  it("summarizes an action with record names instead of ids", () => {
    const configId = makeConfig(db, "CH4-FEED-N");
    const articleId = makeArticle(db, "TP-014");
    const { summary, refs } = summarizeAction(db, "releaseConfig", {
      configId,
      by: "m.chen",
      notes: "long free text that should not be logged",
      articleId,
    });
    expect(summary).toBe("Released config — CH4-FEED-N, TP-014");
    expect(refs.sort()).toEqual([articleId, configId].sort());
  });

  it("picks up the new record from a redirect target and quotes salient fields", () => {
    const configId = makeConfig(db, "NEW-CFG");
    const { summary, refs } = summarizeAction(
      db,
      "createConfigAction",
      { key: "NEW-CFG", name: "New config" },
      `NEXT_REDIRECT;push;/configs/${configId};307;`,
    );
    expect(refs).toEqual([configId]);
    expect(summary).toBe("Created config — NEW-CFG — New config");
  });

  it("falls back to a readable label for unmapped actions", () => {
    expect(actionLabel("doSomethingNewAction")).toBe("Do something new");
  });
});
