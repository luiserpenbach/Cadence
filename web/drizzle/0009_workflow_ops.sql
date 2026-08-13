CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`part_revision_id` text NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`location` text DEFAULT 'SHOP' NOT NULL,
	`lot_code` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`completed_by` text,
	`lot_id` text,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `inventory_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_orders_key_uidx` ON `work_orders` (`key`);--> statement-breakpoint
ALTER TABLE `configurations` ADD `program` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `configurations` ADD `envelope` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `cert_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `cert_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_definitions` ADD `unit` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_definitions` ADD `limit_min` real;--> statement-breakpoint
ALTER TABLE `test_definitions` ADD `limit_max` real;