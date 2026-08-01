import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { makeConfig } from "../../test/fixtures";
import {
  approveRelease,
  releaseConfiguration,
  requestRelease,
  returnToDraft,
} from "./release";

describe("releaseConfiguration (direct, R0–R2)", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  function getConfig(configId: string) {
    return db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, configId))
      .get()!;
  }

  it("releases a draft config", () => {
    const configId = makeConfig(db, "CFG-A");
    const result = releaseConfiguration(db, { configId, by: "m.chen" });
    expect(result.ok).toBe(true);
    const config = getConfig(configId);
    expect(config.status).toBe("released");
    expect(config.releasedBy).toBe("m.chen");
  });

  it("rejects releasing a non-draft config (B4)", () => {
    const configId = makeConfig(db, "CFG-A", {
      status: "released",
      releasedBy: "original",
    });
    expect(releaseConfiguration(db, { configId, by: "m.chen" }).ok).toBe(false);
    expect(getConfig(configId).releasedBy).toBe("original");
  });

  it("rejects unknown configs", () => {
    expect(releaseConfiguration(db, { configId: "nope", by: "x" }).ok).toBe(false);
  });

  it("rejects direct release of R3 — must use the review flow", () => {
    const configId = makeConfig(db, "CFG-R3", { riskClass: "R3" });
    const result = releaseConfiguration(db, { configId, by: "m.chen" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("request release");
    expect(getConfig(configId).status).toBe("draft");
  });

  it("supersedes the base by default, keeps it on partial cut-in", () => {
    const base = makeConfig(db, "CFG-N", { status: "released" });
    const next = makeConfig(db, "CFG-N1", { basedOnConfigId: base });
    releaseConfiguration(db, { configId: next, by: "m.chen" });
    expect(getConfig(base).status).toBe("superseded");

    const base2 = makeConfig(db, "CFG-M", { status: "released" });
    const next2 = makeConfig(db, "CFG-M1", { basedOnConfigId: base2 });
    releaseConfiguration(db, {
      configId: next2,
      by: "m.chen",
      supersedeBase: false,
    });
    expect(getConfig(base2).status).toBe("released");
    expect(getConfig(next2).status).toBe("released");
  });
});

describe("R3 request/approve flow", () => {
  let db: Db;
  let configId: string;

  beforeEach(() => {
    db = createTestDb();
    configId = makeConfig(db, "CFG-R3", { riskClass: "R3" });
  });

  function getConfig(id: string) {
    return db
      .select()
      .from(s.configurations)
      .where(eq(s.configurations.id, id))
      .get()!;
  }

  it("request puts the config in review with requester recorded", () => {
    const result = requestRelease(db, { configId, by: "m.chen" });
    expect(result.ok).toBe(true);
    const config = getConfig(configId);
    expect(config.status).toBe("in_review");
    expect(config.releaseRequestedBy).toBe("m.chen");
    expect(config.releaseRequestedAt).toBeTruthy();
  });

  it("rejects requests on non-R3 or non-draft configs", () => {
    const r1 = makeConfig(db, "CFG-R1", { riskClass: "R1" });
    expect(requestRelease(db, { configId: r1, by: "x" }).ok).toBe(false);

    requestRelease(db, { configId, by: "m.chen" });
    expect(requestRelease(db, { configId, by: "m.chen" }).ok).toBe(false);
  });

  it("approve rejects the requester approving their own request", () => {
    requestRelease(db, { configId, by: "m.chen" });
    const result = approveRelease(db, { configId, reviewer: "m.chen" });
    expect(result.ok).toBe(false);
    expect(getConfig(configId).status).toBe("in_review");
  });

  it("approve by a different person releases with both identities recorded", () => {
    requestRelease(db, { configId, by: "m.chen" });
    const result = approveRelease(db, { configId, reviewer: "lead.k" });
    expect(result.ok).toBe(true);
    const config = getConfig(configId);
    expect(config.status).toBe("released");
    expect(config.releasedBy).toBe("m.chen");
    expect(config.reviewerAckBy).toBe("lead.k");
    expect(config.reviewerAckAt).toBeTruthy();
  });

  it("approve without a pending request is rejected", () => {
    expect(approveRelease(db, { configId, reviewer: "lead.k" }).ok).toBe(false);
  });

  it("approve supersedes the base like a direct release", () => {
    const base = makeConfig(db, "CFG-N", { status: "released" });
    const next = makeConfig(db, "CFG-N1", {
      riskClass: "R3",
      basedOnConfigId: base,
    });
    requestRelease(db, { configId: next, by: "m.chen" });
    approveRelease(db, { configId: next, reviewer: "lead.k" });
    expect(getConfig(base).status).toBe("superseded");
  });

  it("returnToDraft clears the request", () => {
    requestRelease(db, { configId, by: "m.chen" });
    expect(returnToDraft(db, { configId }).ok).toBe(true);
    const config = getConfig(configId);
    expect(config.status).toBe("draft");
    expect(config.releaseRequestedBy).toBeNull();
    expect(returnToDraft(db, { configId }).ok).toBe(false);
  });
});
