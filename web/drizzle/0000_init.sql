CREATE TABLE IF NOT EXISTS `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`serial` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'in_build' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `articles_serial_uidx` ON `articles` (`serial`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `as_built_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`run_id` text,
	`part_revision_id` text NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	`serial_or_lot` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `config_bom_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`part_revision_id` text NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	`find_number` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `config_effectivity` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`stand_id` text,
	`serial_from` text,
	`serial_to` text,
	`any_article` integer DEFAULT true NOT NULL,
	`any_stand` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stand_id`) REFERENCES `stands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `config_effectivity_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`effectivity_id` text NOT NULL,
	`article_id` text NOT NULL,
	FOREIGN KEY (`effectivity_id`) REFERENCES `config_effectivity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `config_procedures` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`procedure_id` text NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `config_required_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`test_definition_id` text NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_definition_id`) REFERENCES `test_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`risk_class` text DEFAULT 'R1' NOT NULL,
	`based_on_config_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`released_at` text,
	`released_by` text,
	`reviewer_ack_by` text,
	`reviewer_ack_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `configurations_key_uidx` ON `configurations` (`key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `inventory_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`part_revision_id` text NOT NULL,
	`qty_on_hand` real DEFAULT 0 NOT NULL,
	`location` text DEFAULT 'PROTO-CAGE' NOT NULL,
	`lot_code` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `part_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`part_id` text NOT NULL,
	`revision` text NOT NULL,
	`status` text DEFAULT 'released' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `part_revisions_part_rev_uidx` ON `part_revisions` (`part_id`,`revision`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `parts` (
	`id` text PRIMARY KEY NOT NULL,
	`part_number` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'hardware' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `parts_part_number_uidx` ON `parts` (`part_number`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `procedures` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`version` text DEFAULT 'A' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `procedures_key_uidx` ON `procedures` (`key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`part_revision_id` text NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	`unit_cost` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`po_number` text NOT NULL,
	`supplier` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`article_id` text NOT NULL,
	`stand_id` text NOT NULL,
	`article_config_id` text NOT NULL,
	`stand_config_id` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`gap_acknowledged` integer DEFAULT false NOT NULL,
	`gap_ack_by` text,
	`gap_ack_at` text,
	`gap_ack_reason` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stand_id`) REFERENCES `stands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_config_id`) REFERENCES `configurations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stand_config_id`) REFERENCES `configurations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stands` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `stands_key_uidx` ON `stands` (`key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `test_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`applies_to` text DEFAULT 'article' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `test_definitions_key_uidx` ON `test_definitions` (`key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`test_definition_id` text NOT NULL,
	`status` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	`recorded_by` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_definition_id`) REFERENCES `test_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `waivers` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`test_definition_id` text NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_definition_id`) REFERENCES `test_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
