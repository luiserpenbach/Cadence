import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "cadence.db");

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

const globalForDb = globalThis as unknown as {
  cadenceSqlite?: Database.Database;
  cadenceDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function getSqlite() {
  if (!globalForDb.cadenceSqlite) {
    globalForDb.cadenceSqlite = ensureDb();
  }
  return globalForDb.cadenceSqlite;
}

export function getDb() {
  if (!globalForDb.cadenceDb) {
    globalForDb.cadenceDb = drizzle(getSqlite(), { schema });
  }
  return globalForDb.cadenceDb;
}

export function getRawSqlite() {
  return getSqlite();
}

export type Db = ReturnType<typeof getDb>;
