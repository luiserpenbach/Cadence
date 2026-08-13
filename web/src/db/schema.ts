import { relations, sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const riskClasses = ["R0", "R1", "R2", "R3"] as const;
export type RiskClass = (typeof riskClasses)[number];

export const configKinds = ["article", "stand"] as const;
export type ConfigKind = (typeof configKinds)[number];

// R3 configs pass through in_review: one person requests, a different
// person approves — two actions, two timestamps, no self-review.
export const releaseStatuses = [
  "draft",
  "in_review",
  "released",
  "superseded",
] as const;
export type ReleaseStatus = (typeof releaseStatuses)[number];

export const partSourcings = ["make", "buy", "cots"] as const;
export type PartSourcing = (typeof partSourcings)[number];

export const partKinds = ["component", "assembly"] as const;
export type PartKind = (typeof partKinds)[number];

export const parts = sqliteTable(
  "parts",
  {
    id: text("id").primaryKey(),
    partNumber: text("part_number").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("hardware"),
    // make | buy | cots
    sourcing: text("sourcing").notNull().default("buy"),
    // component | assembly (declared; part-to-part structure is post-v0)
    kind: text("kind").notNull().default("component"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("parts_part_number_uidx").on(t.partNumber)],
);

export const partRevisions = sqliteTable(
  "part_revisions",
  {
    id: text("id").primaryKey(),
    partId: text("part_id")
      .notNull()
      .references(() => parts.id),
    revision: text("revision").notNull(),
    status: text("status").notNull().default("released"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("part_revisions_part_rev_uidx").on(t.partId, t.revision),
  ],
);

export const stands = sqliteTable(
  "stands",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    location: text("location").notNull().default(""),
    notes: text("notes").notNull().default(""),
  },
  (t) => [uniqueIndex("stands_key_uidx").on(t.key)],
);

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    serial: text("serial").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("in_build"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("articles_serial_uidx").on(t.serial)],
);

export const configurations = sqliteTable(
  "configurations",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // article | stand
    status: text("status").notNull().default("draft"),
    riskClass: text("risk_class").notNull().default("R1"),
    basedOnConfigId: text("based_on_config_id"),
    notes: text("notes").notNull().default(""),
    releasedAt: text("released_at"),
    releasedBy: text("released_by"),
    releaseRequestedBy: text("release_requested_by"),
    releaseRequestedAt: text("release_requested_at"),
    reviewerAckBy: text("reviewer_ack_by"),
    reviewerAckAt: text("reviewer_ack_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("configurations_key_uidx").on(t.key)],
);

export const articleScopes = ["any", "serial_range", "explicit"] as const;
export type ArticleScope = (typeof articleScopes)[number];

export const standScopes = ["any", "explicit"] as const;
export type StandScope = (typeof standScopes)[number];

export const configEffectivity = sqliteTable("config_effectivity", {
  id: text("id").primaryKey(),
  configId: text("config_id")
    .notNull()
    .references(() => configurations.id),
  // any => all articles; serial_range => serialFrom/serialTo (natural serial
  // order); explicit => rows in config_effectivity_articles
  articleScope: text("article_scope").notNull().default("any"),
  serialFrom: text("serial_from"),
  serialTo: text("serial_to"),
  // any => all stands; explicit => standId
  standScope: text("stand_scope").notNull().default("any"),
  standId: text("stand_id").references(() => stands.id),
});

export const configEffectivityArticles = sqliteTable(
  "config_effectivity_articles",
  {
    id: text("id").primaryKey(),
    effectivityId: text("effectivity_id")
      .notNull()
      .references(() => configEffectivity.id),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id),
  },
);

export const configBomLines = sqliteTable("config_bom_lines", {
  id: text("id").primaryKey(),
  configId: text("config_id")
    .notNull()
    .references(() => configurations.id),
  partRevisionId: text("part_revision_id")
    .notNull()
    .references(() => partRevisions.id),
  qty: real("qty").notNull().default(1),
  findNumber: text("find_number").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

// Procedures version like part revisions: editing releases a new (key,
// version) row so configs keep pointing at the exact text they released with.
export const procedures = sqliteTable(
  "procedures",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    version: text("version").notNull().default("A"),
  },
  (t) => [uniqueIndex("procedures_key_version_uidx").on(t.key, t.version)],
);

export const configProcedures = sqliteTable("config_procedures", {
  id: text("id").primaryKey(),
  configId: text("config_id")
    .notNull()
    .references(() => configurations.id),
  procedureId: text("procedure_id")
    .notNull()
    .references(() => procedures.id),
});

export const testDefinitions = sqliteTable(
  "test_definitions",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    appliesTo: text("applies_to").notNull().default("article"), // article | stand | either
  },
  (t) => [uniqueIndex("test_definitions_key_uidx").on(t.key)],
);

export const configRequiredTests = sqliteTable("config_required_tests", {
  id: text("id").primaryKey(),
  configId: text("config_id")
    .notNull()
    .references(() => configurations.id),
  testDefinitionId: text("test_definition_id")
    .notNull()
    .references(() => testDefinitions.id),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  articleId: text("article_id")
    .notNull()
    .references(() => articles.id),
  standId: text("stand_id")
    .notNull()
    .references(() => stands.id),
  articleConfigId: text("article_config_id")
    .notNull()
    .references(() => configurations.id),
  standConfigId: text("stand_config_id")
    .notNull()
    .references(() => configurations.id),
  status: text("status").notNull().default("planned"), // planned | in_progress | complete
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// As-run procedure evidence (CONCEPT §10.4, evidence over documents): an
// execution binds a run to an exact procedure version; each step record
// snapshots the instruction text it was executed against.
export const procedureExecutions = sqliteTable("procedure_executions", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  procedureId: text("procedure_id")
    .notNull()
    .references(() => procedures.id),
  status: text("status").notNull().default("in_progress"), // in_progress | complete | aborted
  startedBy: text("started_by").notNull(),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
  abortReason: text("abort_reason").notNull().default(""),
});

export const stepRecords = sqliteTable("step_records", {
  id: text("id").primaryKey(),
  executionId: text("execution_id")
    .notNull()
    .references(() => procedureExecutions.id),
  stepIndex: integer("step_index").notNull(),
  instruction: text("instruction").notNull(), // snapshot at execution time
  outcome: text("outcome").notNull(), // done | skipped | flagged
  value: text("value").notNull().default(""),
  note: text("note").notNull().default(""),
  recordedBy: text("recorded_by").notNull(),
  recordedAt: text("recorded_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const testResults = sqliteTable("test_results", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  testDefinitionId: text("test_definition_id")
    .notNull()
    .references(() => testDefinitions.id),
  status: text("status").notNull(), // pass | fail | waived | stale | missing
  value: text("value").notNull().default(""),
  notes: text("notes").notNull().default(""),
  recordedAt: text("recorded_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  recordedBy: text("recorded_by").notNull().default(""),
});

// Gap acknowledgments are explicit objects: who accepted proceeding, when,
// why — and exactly which gaps (test + status at ack time). A gap that
// appears after the ack is not covered and warns again.
export const runGapAcks = sqliteTable("run_gap_acks", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  ackBy: text("ack_by").notNull(),
  ackAt: text("ack_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  reason: text("reason").notNull(),
});

export const runGapAckLines = sqliteTable("run_gap_ack_lines", {
  id: text("id").primaryKey(),
  ackId: text("ack_id")
    .notNull()
    .references(() => runGapAcks.id),
  testDefinitionId: text("test_definition_id")
    .notNull()
    .references(() => testDefinitions.id),
  // gap status when acknowledged: missing | fail | stale | waived
  status: text("status").notNull(),
});

export const waivers = sqliteTable("waivers", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  testDefinitionId: text("test_definition_id")
    .notNull()
    .references(() => testDefinitions.id),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const asBuiltLines = sqliteTable("as_built_lines", {
  id: text("id").primaryKey(),
  articleId: text("article_id")
    .notNull()
    .references(() => articles.id),
  runId: text("run_id").references(() => runs.id),
  partRevisionId: text("part_revision_id")
    .notNull()
    .references(() => partRevisions.id),
  qty: real("qty").notNull().default(1),
  serialOrLot: text("serial_or_lot").notNull().default(""),
  // Set when this line consumed an inventory lot (so reverse can restock).
  lotId: text("lot_id"),
  notes: text("notes").notNull().default(""),
  recordedAt: text("recorded_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const inventoryLots = sqliteTable(
  "inventory_lots",
  {
    id: text("id").primaryKey(),
    partRevisionId: text("part_revision_id")
      .notNull()
      .references(() => partRevisions.id),
    qtyOnHand: real("qty_on_hand").notNull().default(0),
    qtyReserved: real("qty_reserved").notNull().default(0),
    location: text("location").notNull().default("PROTO-CAGE"),
    lotCode: text("lot_code").notNull().default(""),
  },
  (t) => [
    uniqueIndex("inventory_lots_rev_lot_uidx").on(t.partRevisionId, t.lotCode),
  ],
);

export const movementKinds = [
  "receive",
  "adjust",
  "issue",
  "reserve",
  "unreserve",
  "kit_issue",
] as const;
export type MovementKind = (typeof movementKinds)[number];

export const inventoryMovements = sqliteTable("inventory_movements", {
  id: text("id").primaryKey(),
  lotId: text("lot_id")
    .notNull()
    .references(() => inventoryLots.id),
  kind: text("kind").notNull(),
  qty: real("qty").notNull(),
  reason: text("reason").notNull().default(""),
  by: text("by").notNull(),
  refType: text("ref_type").notNull().default(""),
  refId: text("ref_id").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const kitStatuses = ["open", "reserved", "issued", "cancelled"] as const;
export type KitStatus = (typeof kitStatuses)[number];

export const kits = sqliteTable(
  "kits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id),
    configId: text("config_id")
      .notNull()
      .references(() => configurations.id),
    status: text("status").notNull().default("open"),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    issuedAt: text("issued_at"),
    issuedBy: text("issued_by"),
    cancelledAt: text("cancelled_at"),
    cancelledBy: text("cancelled_by"),
  },
  (t) => [uniqueIndex("kits_key_uidx").on(t.key)],
);

export const kitLines = sqliteTable("kit_lines", {
  id: text("id").primaryKey(),
  kitId: text("kit_id")
    .notNull()
    .references(() => kits.id),
  partRevisionId: text("part_revision_id")
    .notNull()
    .references(() => partRevisions.id),
  findNumber: text("find_number").notNull().default(""),
  qty: real("qty").notNull().default(1),
  lotId: text("lot_id").references(() => inventoryLots.id),
});

export const configBomAlternates = sqliteTable(
  "config_bom_alternates",
  {
    id: text("id").primaryKey(),
    bomLineId: text("bom_line_id")
      .notNull()
      .references(() => configBomLines.id),
    partRevisionId: text("part_revision_id")
      .notNull()
      .references(() => partRevisions.id),
  },
  (t) => [
    uniqueIndex("config_bom_alternates_line_rev_uidx").on(
      t.bomLineId,
      t.partRevisionId,
    ),
  ],
);

export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    poNumber: text("po_number").notNull(),
    supplier: text("supplier").notNull(),
    status: text("status").notNull().default("open"), // open | ordered | received
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    receivedAt: text("received_at"),
    receivedBy: text("received_by"),
  },
  (t) => [uniqueIndex("purchase_orders_po_number_uidx").on(t.poNumber)],
);

export const purchaseOrderLines = sqliteTable("purchase_order_lines", {
  id: text("id").primaryKey(),
  purchaseOrderId: text("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  partRevisionId: text("part_revision_id")
    .notNull()
    .references(() => partRevisions.id),
  qty: real("qty").notNull().default(1),
  unitCost: real("unit_cost").notNull().default(0),
});

// Drawings, datasheets, reports — links or uploaded files, attached to a
// part or a configuration. PDFs are attachments, not truth (CONCEPT §10.4).
export const attachmentEntities = ["part", "configuration"] as const;
export type AttachmentEntity = (typeof attachmentEntities)[number];

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(), // part | configuration
  entityId: text("entity_id").notNull(),
  kind: text("kind").notNull(), // link | file
  label: text("label").notNull(),
  url: text("url").notNull().default(""), // for links
  fileName: text("file_name").notNull().default(""), // for files (on disk)
  mimeType: text("mime_type").notNull().default(""),
  addedBy: text("added_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const partsRelations = relations(parts, ({ many }) => ({
  revisions: many(partRevisions),
}));

export const partRevisionsRelations = relations(partRevisions, ({ one }) => ({
  part: one(parts, {
    fields: [partRevisions.partId],
    references: [parts.id],
  }),
}));

export const configurationsRelations = relations(
  configurations,
  ({ many, one }) => ({
    bomLines: many(configBomLines),
    requiredTests: many(configRequiredTests),
    procedures: many(configProcedures),
    effectivity: many(configEffectivity),
    basedOn: one(configurations, {
      fields: [configurations.basedOnConfigId],
      references: [configurations.id],
    }),
  }),
);
