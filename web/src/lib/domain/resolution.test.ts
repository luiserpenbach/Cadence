import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import { makeArticle, makeConfig, makeStand } from "../../test/fixtures";
import type { ExecutionContext } from "./effectivity";
import { resolveConfig } from "./resolution";

type Scope = {
  articleScope?: "any" | "serial_range" | "explicit";
  serialFrom?: string;
  serialTo?: string;
  standScope?: "any" | "explicit";
  standId?: string;
  explicitArticleIds?: string[];
};

describe("resolveConfig (CONCEPT §4 most-specific-wins)", () => {
  let db: Db;
  let articleId: string;
  let standId: string;
  let otherStandId: string;
  let ctx: ExecutionContext;

  beforeEach(() => {
    db = createTestDb();
    articleId = makeArticle(db, "TP-014");
    standId = makeStand(db, "STAND-B");
    otherStandId = makeStand(db, "COLD-FLOW-1");
    ctx = { articleId, articleSerial: "TP-014", standId };
  });

  function releasedConfig(key: string, scope: Scope, kind = "article") {
    const configId = makeConfig(db, key, { kind, status: "released" });
    const effId = id("eff");
    db.insert(s.configEffectivity)
      .values({
        id: effId,
        configId,
        articleScope: scope.articleScope ?? "any",
        serialFrom: scope.serialFrom,
        serialTo: scope.serialTo,
        standScope: scope.standScope ?? "any",
        standId: scope.standId,
      })
      .run();
    for (const aid of scope.explicitArticleIds ?? []) {
      db.insert(s.configEffectivityArticles)
        .values({ id: id("efa"), effectivityId: effId, articleId: aid })
        .run();
    }
    return configId;
  }

  it("returns none when nothing covers the context", () => {
    expect(resolveConfig(db, "article", ctx).outcome).toBe("none");
  });

  it("exact (article, stand) beats article-only", () => {
    releasedConfig("ART-ONLY", {
      articleScope: "explicit",
      explicitArticleIds: [articleId],
    });
    releasedConfig("EXACT", {
      articleScope: "explicit",
      explicitArticleIds: [articleId],
      standScope: "explicit",
      standId,
    });

    const result = resolveConfig(db, "article", ctx);
    expect(result.outcome).toBe("resolved");
    if (result.outcome !== "resolved") return;
    expect(result.config.key).toBe("EXACT");
    expect(result.rank).toBe(3);
  });

  it("article-only beats stand-only, stand-only beats any/any", () => {
    releasedConfig("GLOBAL", {});
    releasedConfig("STAND-ONLY", { standScope: "explicit", standId });
    let result = resolveConfig(db, "article", ctx);
    expect(result.outcome === "resolved" && result.config.key).toBe(
      "STAND-ONLY",
    );

    releasedConfig("ART-ONLY", {
      articleScope: "serial_range",
      serialFrom: "TP-010",
    });
    result = resolveConfig(db, "article", ctx);
    expect(result.outcome === "resolved" && result.config.key).toBe("ART-ONLY");
  });

  it("serial ranges use natural serial order", () => {
    releasedConfig("RANGE", {
      articleScope: "serial_range",
      serialFrom: "TP-9",
      serialTo: "TP-20",
    });
    // TP-014 is inside [TP-9, TP-20] numerically, outside lexicographically
    const result = resolveConfig(db, "article", ctx);
    expect(result.outcome).toBe("resolved");
  });

  it("equal-specificity overlap is a conflict, not an auto-pick", () => {
    releasedConfig("A", { articleScope: "serial_range", serialFrom: "TP-010" });
    releasedConfig("B", {
      articleScope: "explicit",
      explicitArticleIds: [articleId],
    });

    const result = resolveConfig(db, "article", ctx);
    expect(result.outcome).toBe("conflict");
    if (result.outcome !== "conflict") return;
    expect(result.candidates.map((c) => c.key).sort()).toEqual(["A", "B"]);
  });

  it("ignores draft and superseded configs", () => {
    const draftId = makeConfig(db, "DRAFT", { kind: "article" });
    db.insert(s.configEffectivity)
      .values({ id: id("eff"), configId: draftId })
      .run();
    const supersededId = makeConfig(db, "OLD", {
      kind: "article",
      status: "superseded",
    });
    db.insert(s.configEffectivity)
      .values({ id: id("eff"), configId: supersededId })
      .run();

    expect(resolveConfig(db, "article", ctx).outcome).toBe("none");
  });

  it("ignores effectivity scoped to a different stand or serial", () => {
    releasedConfig("OTHER-STAND", {
      standScope: "explicit",
      standId: otherStandId,
    });
    releasedConfig("LATER-SERIALS", {
      articleScope: "serial_range",
      serialFrom: "TP-017",
    });
    expect(resolveConfig(db, "article", ctx).outcome).toBe("none");
  });

  it("resolves article and stand kinds independently", () => {
    releasedConfig("ART", {});
    releasedConfig("STAND-CFG", { standScope: "explicit", standId }, "stand");

    const art = resolveConfig(db, "article", ctx);
    const stand = resolveConfig(db, "stand", ctx);
    expect(art.outcome === "resolved" && art.config.key).toBe("ART");
    expect(stand.outcome === "resolved" && stand.config.key).toBe("STAND-CFG");
  });
});
