import path from "node:path";
import { sql } from "drizzle-orm";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./index";
import * as schema from "./schema";

const migrationsFolder = path.join(process.cwd(), "drizzle");

export function migrate() {
  drizzleMigrate(getDb(), { migrationsFolder });
}

export function isSeeded() {
  const db = getDb();
  const row = db.select({ c: sql<number>`count(*)` }).from(schema.parts).get();
  return (row?.c ?? 0) > 0;
}
