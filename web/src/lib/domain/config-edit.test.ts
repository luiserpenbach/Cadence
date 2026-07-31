import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import {
  makeArticle,
  makeConfig,
  makePart,
  makeStand,
  makeTestDef,
} from "../../test/fixtures";
import {
  addBomLine,
  addEffectivityRow,
  addRequiredTest,
  removeBomLine,
  removeEffectivityRow,
  removeRequiredTest,
} from "./config-edit";

describe("draft config editing", () => {
  let db: Db;
  let draftId: string;
  let releasedId: string;
  let revId: string;
  let testId: string;

  beforeEach(() => {
    db = createTestDb();
    draftId = makeConfig(db, "CFG-DRAFT");
    releasedId = makeConfig(db, "CFG-REL", { status: "released" });
    revId = makePart(db, "VLV-001").revId;
    testId = makeTestDef(db, "LEAK-CHECK");
  });

  it("adds and removes BoM lines on a draft", () => {
    const added = addBomLine(db, {
      configId: draftId,
      partRevisionId: revId,
      qty: 2,
      findNumber: "10",
    });
    expect(added.ok).toBe(true);

    const lines = db
      .select()
      .from(s.configBomLines)
      .where(eq(s.configBomLines.configId, draftId))
      .all();
    expect(lines).toHaveLength(1);

    expect(
      removeBomLine(db, { configId: draftId, bomLineId: lines[0].id }).ok,
    ).toBe(true);
    expect(
      db
        .select()
        .from(s.configBomLines)
        .where(eq(s.configBomLines.configId, draftId))
        .all(),
    ).toHaveLength(0);
  });

  it("rejects every mutation on a released config", () => {
    const results = [
      addBomLine(db, {
        configId: releasedId,
        partRevisionId: revId,
        qty: 1,
        findNumber: "",
      }),
      removeBomLine(db, { configId: releasedId, bomLineId: "x" }),
      addRequiredTest(db, { configId: releasedId, testDefinitionId: testId }),
      removeRequiredTest(db, { configId: releasedId, testDefinitionId: testId }),
      addEffectivityRow(db, {
        configId: releasedId,
        articleScope: "any",
        standScope: "any",
        explicitArticleIds: [],
      }),
      removeEffectivityRow(db, { configId: releasedId, effectivityId: "x" }),
    ];
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("immutable");
    }
  });

  it("deduplicates required tests", () => {
    expect(
      addRequiredTest(db, { configId: draftId, testDefinitionId: testId }).ok,
    ).toBe(true);
    expect(
      addRequiredTest(db, { configId: draftId, testDefinitionId: testId }).ok,
    ).toBe(false);
  });

  it("validates effectivity scope requirements", () => {
    expect(
      addEffectivityRow(db, {
        configId: draftId,
        articleScope: "serial_range",
        standScope: "any",
        explicitArticleIds: [],
      }).ok,
    ).toBe(false);
    expect(
      addEffectivityRow(db, {
        configId: draftId,
        articleScope: "any",
        standScope: "explicit",
        explicitArticleIds: [],
      }).ok,
    ).toBe(false);
    expect(
      addEffectivityRow(db, {
        configId: draftId,
        articleScope: "explicit",
        standScope: "any",
        explicitArticleIds: [],
      }).ok,
    ).toBe(false);
  });

  it("adds explicit effectivity with article links and removes both", () => {
    const articleId = makeArticle(db, "TP-001");
    const standId = makeStand(db, "STAND-B");
    const added = addEffectivityRow(db, {
      configId: draftId,
      articleScope: "explicit",
      standScope: "explicit",
      standId,
      explicitArticleIds: [articleId],
    });
    expect(added.ok).toBe(true);

    const rows = db
      .select()
      .from(s.configEffectivity)
      .where(eq(s.configEffectivity.configId, draftId))
      .all();
    expect(rows).toHaveLength(1);
    expect(
      db
        .select()
        .from(s.configEffectivityArticles)
        .where(eq(s.configEffectivityArticles.effectivityId, rows[0].id))
        .all(),
    ).toHaveLength(1);

    expect(
      removeEffectivityRow(db, { configId: draftId, effectivityId: rows[0].id })
        .ok,
    ).toBe(true);
    expect(db.select().from(s.configEffectivityArticles).all()).toHaveLength(0);
    expect(db.select().from(s.configEffectivity).all()).toHaveLength(0);
  });
});
