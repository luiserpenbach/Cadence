CREATE TABLE `audit_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`refs` text DEFAULT '' NOT NULL,
	`prev_hash` text DEFAULT '' NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`severity` text DEFAULT 'minor' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`article_id` text,
	`part_revision_id` text,
	`lot_id` text,
	`run_id` text,
	`reported_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`disposition` text DEFAULT '' NOT NULL,
	`disposition_notes` text DEFAULT '' NOT NULL,
	`disposition_by` text,
	`disposition_at` text,
	`closed_by` text,
	`closed_at` text,
	`close_notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_revision_id`) REFERENCES `part_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `inventory_lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_key_uidx` ON `issues` (`key`);