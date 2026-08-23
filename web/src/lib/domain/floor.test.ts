import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { id } from "../id";
import { createTestDb } from "../../test/db";
import {
  addBomLine,
  makeArticle,
  makeConfig,
  makePart,
  makeRun,
  makeStand,
} from "../../test/fixtures";
import { diffAsBuilt, reverseAsBuilt } from "./asbuilt";
import { getFloorView } from "./floor";
import { createLot } from "./inventory";
import {
  allocateRemaining,
  createKit,
  findActiveKit,
  issueKit,
} from "./kits";

describe("getFloorView", () => {
  let db: Db;
  let articleId: string;
  let standId: string;

  beforeEach(() => {
    db = createTestDb();
    articleId = makeArticle(db, "TP-014");
    standId = makeStand(db, "STAND-B");
  });

  function releasedConfig(key: string, kind = "article") {
    const configId = makeConfig(db, key, { kind, status: "released" });
    db.insert(s.configEffectivity).values({ id: id("eff"), configId }).run();
    return configId;
  }

  it("resolves both configs and reports no change without prior runs", () => {
    releasedConfig("ART-N");
    releasedConfig("STAND-N", "stand");

    const view = getFloorView(db, articleId, standId)!;
    expect(view.articleResolution.outcome).toBe("resolved");
    expect(view.standResolution.outcome).toBe("resolved");
    expect(view.lastRun).toBeNull();
    expect(view.changedSinceLastRun).toBe(false);
  });

  it("flags a config change since the article's last run", () => {
    const oldCfg = makeConfig(db, "ART-N", { status: "superseded" });
    const newCfg = releasedConfig("ART-N1");
    const standCfg = releasedConfig("STAND-N", "stand");
    makeRun(db, {
      articleId,
      standId,
      articleConfigId: oldCfg,
      standConfigId: standCfg,
    });

    const view = getFloorView(db, articleId, standId)!;
    expect(view.changedSinceLastRun).toBe(true);
    expect(view.lastRunArticleConfig?.key).toBe("ART-N");
    expect(
      view.articleResolution.outcome === "resolved" &&
        view.articleResolution.config.id === newCfg,
    ).toBe(true);
  });

  it("reports no change when the last run used the currently resolved config", () => {
    const cfg = releasedConfig("ART-N");
    const standCfg = releasedConfig("STAND-N", "stand");
    makeRun(db, {
      articleId,
      standId,
      articleConfigId: cfg,
      standConfigId: standCfg,
    });

    const view = getFloorView(db, articleId, standId)!;
    expect(view.changedSinceLastRun).toBe(false);
  });

  it("returns null for unknown article or stand", () => {
    expect(getFloorView(db, "nope", standId)).toBeNull();
    expect(getFloorView(db, articleId, "nope")).toBeNull();
  });

  it("kits, issues as-built, and reverse for the resolved floor article", () => {
    const part = makePart(db, "VLV-001");
    const configId = releasedConfig("ART-N");
    addBomLine(db, configId, part.revId, 1, "10");
    releasedConfig("STAND-N", "stand");

    const view = getFloorView(db, articleId, standId)!;
    expect(view.articleResolution.outcome).toBe("resolved");
    expect(findActiveKit(db, articleId, configId)).toBeUndefined();

    const lot = createLot(db, {
      partRevisionId: part.revId,
      qty: 1,
      lotCode: "LOT-V",
      location: "CAGE",
      by: "cage",
    });
    expect(lot.ok).toBe(true);

    const kit = createKit(db, { articleId, configId, by: "cage" });
    expect(kit.ok).toBe(true);
    if (!kit.ok) return;
    expect(findActiveKit(db, articleId, configId)?.id).toBe(kit.kitId);
    expect(allocateRemaining(db, { kitId: kit.kitId, by: "cage" }).ok).toBe(
      true,
    );
    expect(issueKit(db, { kitId: kit.kitId, by: "cage" }).ok).toBe(true);

    const matched = diffAsBuilt(db, articleId)!;
    expect(matched.lines).toHaveLength(0);

    const line = db.select().from(s.asBuiltLines).all()[0];
    expect(reverseAsBuilt(db, { asBuiltId: line.id, by: "tech" }).ok).toBe(
      true,
    );
    const after = diffAsBuilt(db, articleId)!;
    expect(after.lines.some((l) => l.kind === "missing")).toBe(true);
  });
});
