CREATE TABLE `run_gap_ack_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`ack_id` text NOT NULL,
	`test_definition_id` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`ack_id`) REFERENCES `run_gap_acks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_definition_id`) REFERENCES `test_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `run_gap_acks` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ack_by` text NOT NULL,
	`ack_at` text DEFAULT (datetime('now')) NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `run_gap_acks` (`id`, `run_id`, `ack_by`, `ack_at`, `reason`)
SELECT 'ack_' || `id`, `id`, COALESCE(`gap_ack_by`, 'unknown'), COALESCE(`gap_ack_at`, datetime('now')), `gap_ack_reason`
FROM `runs` WHERE `gap_acknowledged` = 1;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `gap_acknowledged`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `gap_ack_by`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `gap_ack_at`;--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `gap_ack_reason`;