import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  makeArticle,
  makeConfig,
  makePart,
  makeRun,
  makeStand,
} from "../../test/fixtures";
import {
  closeIssue,
  createIssue,
  dispositionIssue,
  issueCounts,
  listIssues,
  lotsOnHold,
  reopenIssue,
  unresolvedIssuesForRun,
} from "./issues";

describe("issues", () => {
  let db: Db;
  let articleId: string;
  let otherArticleId: string;
  let runId: string;
  let revId: string;
  let lotId: string;

  beforeEach(() => {
    db = createTestDb();
    articleId = makeArticle(db, "TP-001");
    otherArticleId = makeArticle(db, "TP-002");
    runId = makeRun(db, {
      articleId,
      standId: makeStand(db, "STAND-B"),
      articleConfigId: makeConfig(db, "ART-N", { status: "released" }),
      standConfigId: makeConfig(db, "STAND-N", {
        kind: "stand",
        status: "released",
      }),
    });
    revId = makePart(db, "VLV-1").revId;
    lotId = id("inv");
    db.insert(s.inventoryLots)
      .values({ id: lotId, partRevisionId: revId, qtyOnHand: 3, lotCode: "L-77" })
      .run();
  });

  function report(over: Partial<Parameters<typeof createIssue>[1]> = {}) {
    const r = createIssue(db, {
      title: "Seat scored",
      severity: "major",
      reportedBy: "tech.a",
      articleId,
      ...over,
    });
    if (!r.ok) throw new Error(r.error);
    return r;
  }

  it("numbers issues sequentially", () => {
    expect(report().key).toBe("ISS-0001");
    expect(report().key).toBe("ISS-0002");
  });

  it("requires hardware to point at", () => {
    const r = createIssue(db, {
      title: "Something is off",
      severity: "minor",
      reportedBy: "tech.a",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown severity and a blank title", () => {
    expect(
      createIssue(db, { title: "x", severity: "huge", reportedBy: "a", articleId })
        .ok,
    ).toBe(false);
    expect(
      createIssue(db, { title: " ", severity: "minor", reportedBy: "a", articleId })
        .ok,
    ).toBe(false);
  });

  it("derives the article from a run and the part revision from a lot", () => {
    const r = report({ articleId: null, runId, lotId });
    const row = listIssues(db).find((i) => i.id === r.issueId)!;
    expect(row.articleSerial).toBe("TP-001");
    expect(row.partNumber).toBe("VLV-1");
    expect(row.lotCode).toBe("L-77");
  });

  it("rejects a run that was not on the chosen article", () => {
    const r = createIssue(db, {
      title: "x",
      severity: "minor",
      reportedBy: "a",
      articleId: otherArticleId,
      runId,
    });
    expect(r.ok).toBe(false);
  });

  it("walks open → dispositioned → closed and enforces the order", () => {
    const { issueId } = report();
    expect(closeIssue(db, { issueId, by: "lead.k" }).ok).toBe(false);
    expect(
      dispositionIssue(db, { issueId, disposition: "rework", notes: "", by: "lead.k" })
        .ok,
    ).toBe(false);
    expect(
      dispositionIssue(db, {
        issueId,
        disposition: "rework",
        notes: "Lap seat, re-leak-check",
        by: "lead.k",
      }).ok,
    ).toBe(true);
    expect(
      dispositionIssue(db, {
        issueId,
        disposition: "scrap",
        notes: "again",
        by: "lead.k",
      }).ok,
    ).toBe(false);
    expect(closeIssue(db, { issueId, by: "tech.a" }).ok).toBe(true);
    expect(issueCounts(db)).toMatchObject({ open: 0, dispositioned: 0, closed: 1 });
  });

  it("blocks self-disposition on critical issues only", () => {
    const critical = report({ severity: "critical" });
    const self = dispositionIssue(db, {
      issueId: critical.issueId,
      disposition: "use_as_is",
      notes: "Looks fine",
      by: "Tech.A ",
    });
    expect(self.ok).toBe(false);
    expect(
      dispositionIssue(db, {
        issueId: critical.issueId,
        disposition: "use_as_is",
        notes: "Within drawing tolerance",
        by: "lead.k",
      }).ok,
    ).toBe(true);

    const major = report();
    expect(
      dispositionIssue(db, {
        issueId: major.issueId,
        disposition: "use_as_is",
        notes: "Cosmetic",
        by: "tech.a",
      }).ok,
    ).toBe(true);
  });

  it("reopen clears the decision but keeps it in the description", () => {
    const { issueId } = report();
    dispositionIssue(db, {
      issueId,
      disposition: "use_as_is",
      notes: "Cosmetic only",
      by: "lead.k",
    });
    expect(reopenIssue(db, { issueId, by: "qa.m", reason: "" }).ok).toBe(false);
    expect(
      reopenIssue(db, { issueId, by: "qa.m", reason: "Leaked at proof" }).ok,
    ).toBe(true);
    const row = db.select().from(s.issues).where(eqId(issueId)).get()!;
    expect(row.status).toBe("open");
    expect(row.disposition).toBe("");
    expect(row.description).toContain("Leaked at proof");
    expect(row.description).toContain("Cosmetic only");
  });

  it("surfaces unresolved issues on a run via article, run, and installed lots", () => {
    report({ title: "On article" });
    report({ title: "Other article", articleId: otherArticleId });
    const onLot = report({ title: "On lot", articleId: null, lotId });
    expect(unresolvedIssuesForRun(db, runId).map((i) => i.title)).toEqual([
      "On article",
    ]);

    db.insert(s.asBuiltLines)
      .values({ id: id("ab"), articleId, partRevisionId: revId, lotId })
      .run();
    expect(
      unresolvedIssuesForRun(db, runId)
        .map((i) => i.title)
        .sort(),
    ).toEqual(["On article", "On lot"]);

    // Dispositioned-but-not-closed still warns; closed does not.
    dispositionIssue(db, {
      issueId: onLot.issueId,
      disposition: "rework",
      notes: "Re-lap",
      by: "lead.k",
    });
    expect(unresolvedIssuesForRun(db, runId)).toHaveLength(2);
    closeIssue(db, { issueId: onLot.issueId, by: "lead.k" });
    expect(unresolvedIssuesForRun(db, runId)).toHaveLength(1);
  });

  it("puts lots with unresolved issues on hold and sorts critical first", () => {
    report({ title: "Minor", severity: "minor" });
    const c = report({ title: "Crit", severity: "critical", articleId: null, lotId });
    expect([...lotsOnHold(db).keys()]).toEqual([lotId]);
    expect(listIssues(db)[0].title).toBe("Crit");
    dispositionIssue(db, {
      issueId: c.issueId,
      disposition: "scrap",
      notes: "Cracked",
      by: "lead.k",
    });
    closeIssue(db, { issueId: c.issueId, by: "lead.k" });
    expect(lotsOnHold(db).size).toBe(0);
    expect(listIssues(db).map((i) => i.title)).toEqual(["Minor"]);
    expect(listIssues(db, { status: "all" })).toHaveLength(2);
  });
});

function eqId(issueId: string) {
  return eq(s.issues.id, issueId);
}
