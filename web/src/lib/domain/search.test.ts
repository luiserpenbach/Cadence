import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import { makeArticle, makeConfig, makePart } from "../../test/fixtures";
import { createIssue } from "./issues";
import { searchAll } from "./search";

describe("searchAll", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
    const { revId } = makePart(db, "VLV-CRYO-050", "A", { name: "Cryo ball valve" });
    makePart(db, "BRK-VLV", "A", { name: "Valve bracket" });
    makeConfig(db, "CH4-FEED-N");
    const articleId = makeArticle(db, "TP-014");
    db.insert(s.inventoryLots)
      .values({ id: id("inv"), partRevisionId: revId, lotCode: "LOT-VLV-9" })
      .run();
    createIssue(db, {
      title: "Valve seat scored",
      severity: "major",
      reportedBy: "tech.a",
      articleId,
    });
  });

  it("ignores queries shorter than two characters", () => {
    expect(searchAll(db, "v")).toEqual([]);
    expect(searchAll(db, "  ")).toEqual([]);
  });

  it("finds across record types, case-insensitively", () => {
    const types = searchAll(db, "vlv").map((h) => h.type);
    expect(types).toContain("part");
    expect(types).toContain("lot");
    expect(searchAll(db, "valve").map((h) => h.type)).toContain("issue");
    expect(searchAll(db, "tp-014")[0]).toMatchObject({
      type: "article",
      label: "TP-014",
    });
  });

  it("ranks identifier prefix matches above name matches", () => {
    const hits = searchAll(db, "vlv");
    expect(hits[0].label).toBe("VLV-CRYO-050");
    expect(hits.findIndex((h) => h.label === "BRK-VLV")).toBeGreaterThan(0);
  });

  it("treats LIKE wildcards in the query literally", () => {
    expect(searchAll(db, "%%")).toEqual([]);
    expect(searchAll(db, "__")).toEqual([]);
    makePart(db, "SEAL_50%", "A");
    expect(searchAll(db, "l_50%").map((h) => h.label)).toEqual(["SEAL_50%"]);
  });

  it("links lots to their genealogy and configs to their page", () => {
    expect(searchAll(db, "LOT-VLV-9")[0].href).toBe("/trace?q=LOT-VLV-9");
    expect(searchAll(db, "ch4-feed")[0].href).toMatch(/^\/configs\/cfg_/);
  });
});
