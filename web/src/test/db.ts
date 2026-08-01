import Database from "better-sqlite3";
import { replaceDbForTests } from "../db";
import { migrate } from "../db/migrate";

// Swaps the process-wide connection for a fresh in-memory database and runs
// migrations, so code under test that calls getDb() sees an isolated schema.
export function createTestDb() {
  const db = replaceDbForTests(new Database(":memory:"));
  migrate();
  return db;
}
