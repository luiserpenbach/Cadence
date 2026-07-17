import { sql } from "drizzle-orm";
import { getDb, getRawSqlite } from "./index";
import * as schema from "./schema";

const DDL = `
CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  part_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'hardware',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS parts_part_number_uidx ON parts(part_number);

CREATE TABLE IF NOT EXISTS part_revisions (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id),
  revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'released',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS part_revisions_part_rev_uidx ON part_revisions(part_id, revision);

CREATE TABLE IF NOT EXISTS stands (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS stands_key_uidx ON stands(key);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  serial TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_build',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS articles_serial_uidx ON articles(serial);

CREATE TABLE IF NOT EXISTS configurations (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  risk_class TEXT NOT NULL DEFAULT 'R1',
  based_on_config_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  released_at TEXT,
  released_by TEXT,
  reviewer_ack_by TEXT,
  reviewer_ack_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS configurations_key_uidx ON configurations(key);

CREATE TABLE IF NOT EXISTS config_effectivity (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES configurations(id),
  stand_id TEXT REFERENCES stands(id),
  serial_from TEXT,
  serial_to TEXT,
  any_article INTEGER NOT NULL DEFAULT 1,
  any_stand INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS config_effectivity_articles (
  id TEXT PRIMARY KEY,
  effectivity_id TEXT NOT NULL REFERENCES config_effectivity(id),
  article_id TEXT NOT NULL REFERENCES articles(id)
);

CREATE TABLE IF NOT EXISTS config_bom_lines (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES configurations(id),
  part_revision_id TEXT NOT NULL REFERENCES part_revisions(id),
  qty REAL NOT NULL DEFAULT 1,
  find_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT 'A'
);
CREATE UNIQUE INDEX IF NOT EXISTS procedures_key_uidx ON procedures(key);

CREATE TABLE IF NOT EXISTS config_procedures (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES configurations(id),
  procedure_id TEXT NOT NULL REFERENCES procedures(id)
);

CREATE TABLE IF NOT EXISTS test_definitions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  applies_to TEXT NOT NULL DEFAULT 'article'
);
CREATE UNIQUE INDEX IF NOT EXISTS test_definitions_key_uidx ON test_definitions(key);

CREATE TABLE IF NOT EXISTS config_required_tests (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES configurations(id),
  test_definition_id TEXT NOT NULL REFERENCES test_definitions(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles(id),
  stand_id TEXT NOT NULL REFERENCES stands(id),
  article_config_id TEXT NOT NULL REFERENCES configurations(id),
  stand_config_id TEXT NOT NULL REFERENCES configurations(id),
  status TEXT NOT NULL DEFAULT 'planned',
  started_at TEXT,
  completed_at TEXT,
  gap_acknowledged INTEGER NOT NULL DEFAULT 0,
  gap_ack_by TEXT,
  gap_ack_at TEXT,
  gap_ack_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  test_definition_id TEXT NOT NULL REFERENCES test_definitions(id),
  status TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  recorded_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS waivers (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  test_definition_id TEXT NOT NULL REFERENCES test_definitions(id),
  reason TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS as_built_lines (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  run_id TEXT REFERENCES runs(id),
  part_revision_id TEXT NOT NULL REFERENCES part_revisions(id),
  qty REAL NOT NULL DEFAULT 1,
  serial_or_lot TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id TEXT PRIMARY KEY,
  part_revision_id TEXT NOT NULL REFERENCES part_revisions(id),
  qty_on_hand REAL NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT 'PROTO-CAGE',
  lot_code TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL,
  supplier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  part_revision_id TEXT NOT NULL REFERENCES part_revisions(id),
  qty REAL NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0
);
`;

export function migrate() {
  const sqlite = getRawSqlite();
  sqlite.exec(DDL);
}

export function isSeeded() {
  const db = getDb();
  const row = db.select({ c: sql<number>`count(*)` }).from(schema.parts).get();
  return (row?.c ?? 0) > 0;
}

export function ensureReady() {
  migrate();
  if (!isSeeded()) {
    // Lazy import avoided — seed called from seed.ts script or ensureSeeded
  }
}
