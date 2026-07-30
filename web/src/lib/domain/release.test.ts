import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { makeConfig } from "../../test/fixtures";
import { releaseConfiguration } from "./release";

describe("releaseConfiguration", () => {
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
    expect(config.releasedAt).toBeTruthy();
  });

  it("rejects releasing a non-draft config (B4)", () => {
    const configId = makeConfig(db, "CFG-A", {
      status: "released",
      releasedBy: "original",
    });
    const result = releaseConfiguration(db, { configId, by: "m.chen" });
    expect(result.ok).toBe(false);
    expect(getConfig(configId).releasedBy).toBe("original");
  });

  it("rejects an unknown config", () => {
    expect(releaseConfiguration(db, { configId: "nope", by: "x" }).ok).toBe(false);
  });

  it("rejects R3 release without a reviewer (B3)", () => {
    const configId = makeConfig(db, "CFG-R3", { riskClass: "R3" });
    const result = releaseConfiguration(db, { configId, by: "m.chen" });
    expect(result.ok).toBe(false);
    expect(getConfig(configId).status).toBe("draft");
  });

  it("rejects R3 self-review (B3)", () => {
    const configId = makeConfig(db, "CFG-R3", { riskClass: "R3" });
    const result = releaseConfiguration(db, {
      configId,
      by: "m.chen",
      reviewer: "m.chen",
    });
    expect(result.ok).toBe(false);
    expect(getConfig(configId).status).toBe("draft");
  });

  it("releases R3 with a distinct reviewer and records the ack", () => {
    const configId = makeConfig(db, "CFG-R3", { riskClass: "R3" });
    const result = releaseConfiguration(db, {
      configId,
      by: "m.chen",
      reviewer: "lead.k",
    });
    expect(result.ok).toBe(true);
    const config = getConfig(configId);
    expect(config.status).toBe("released");
    expect(config.reviewerAckBy).toBe("lead.k");
    expect(config.reviewerAckAt).toBeTruthy();
  });
});
