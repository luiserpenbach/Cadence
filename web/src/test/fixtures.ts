import type { Db } from "../db";
import * as s from "../db/schema";
import { id } from "../lib/id";

export function makePart(db: Db, partNumber: string, revision = "A") {
  const partId = id("part");
  db.insert(s.parts).values({ id: partId, partNumber, name: partNumber }).run();
  const revId = id("rev");
  db.insert(s.partRevisions)
    .values({ id: revId, partId, revision })
    .run();
  return { partId, revId };
}

export function makeRevision(db: Db, partId: string, revision: string) {
  const revId = id("rev");
  db.insert(s.partRevisions).values({ id: revId, partId, revision }).run();
  return revId;
}

export function makeConfig(
  db: Db,
  key: string,
  overrides: Partial<typeof s.configurations.$inferInsert> = {},
) {
  const configId = id("cfg");
  db.insert(s.configurations)
    .values({
      id: configId,
      key,
      name: key,
      kind: "article",
      status: "draft",
      riskClass: "R1",
      ...overrides,
    })
    .run();
  return configId;
}

export function addBomLine(
  db: Db,
  configId: string,
  partRevisionId: string,
  qty = 1,
  findNumber = "",
) {
  db.insert(s.configBomLines)
    .values({ id: id("bom"), configId, partRevisionId, qty, findNumber })
    .run();
}

export function makeTestDef(db: Db, key: string) {
  const testId = id("tdef");
  db.insert(s.testDefinitions).values({ id: testId, key, name: key }).run();
  return testId;
}

export function requireTest(db: Db, configId: string, testDefinitionId: string) {
  db.insert(s.configRequiredTests)
    .values({ id: id("crt"), configId, testDefinitionId })
    .run();
}

export function makeArticle(db: Db, serial: string) {
  const articleId = id("art");
  db.insert(s.articles).values({ id: articleId, serial, name: serial }).run();
  return articleId;
}

export function makeStand(db: Db, key: string) {
  const standId = id("stand");
  db.insert(s.stands).values({ id: standId, key, name: key }).run();
  return standId;
}

export function makeRun(
  db: Db,
  binding: {
    articleId: string;
    standId: string;
    articleConfigId: string;
    standConfigId: string;
  },
) {
  const runId = id("run");
  db.insert(s.runs)
    .values({ id: runId, key: `RUN-${runId.slice(-4)}`, ...binding })
    .run();
  return runId;
}
