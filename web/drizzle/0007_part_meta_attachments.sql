CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`mime_type` text DEFAULT '' NOT NULL,
	`added_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `parts` ADD `sourcing` text DEFAULT 'buy' NOT NULL;--> statement-breakpoint
ALTER TABLE `parts` ADD `kind` text DEFAULT 'component' NOT NULL;