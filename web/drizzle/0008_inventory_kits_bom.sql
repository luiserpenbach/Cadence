CREATE TABLE `config_bom_alternates` (
	`id` text PRIMARY KEY NOT NULL,
	`bom_line_id` text NOT NULL,
	`part_revision_id` text NOT NULL,
	FOREIGN KEY (`bom_line_id`) REFERENCES `config_bom_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `config_bom_alternates_line_rev_uidx` ON `config_bom_alternates` (`bom_line_id`,`part_revision_id`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`kind` text NOT NULL,
	`qty` real NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`by` text NOT NULL,
	`ref_type` text DEFAULT '' NOT NULL,
	`ref_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `inventory_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`article_id` text NOT NULL,
	`config_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`issued_at` text,
	`issued_by` text,
	`cancelled_at` text,
	`cancelled_by` text,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`config_id`) REFERENCES `configurations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kits_key_uidx` ON `kits` (`key`);--> statement-breakpoint
CREATE TABLE `kit_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`kit_id` text NOT NULL,
	`part_revision_id` text NOT NULL,
	`find_number` text DEFAULT '' NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	`lot_id` text,
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `inventory_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `as_built_lines` ADD `lot_id` text;--> statement-breakpoint
ALTER TABLE `inventory_lots` ADD `qty_reserved` real DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_lots_rev_lot_uidx` ON `inventory_lots` (`part_revision_id`,`lot_code`);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `received_at` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `received_by` text;--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_po_number_uidx` ON `purchase_orders` (`po_number`);
