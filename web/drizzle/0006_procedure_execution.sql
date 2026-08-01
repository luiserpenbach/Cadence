CREATE TABLE `procedure_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`procedure_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`started_by` text NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`abort_reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `step_records` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`instruction` text NOT NULL,
	`outcome` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`recorded_by` text NOT NULL,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `procedure_executions`(`id`) ON UPDATE no action ON DELETE no action
);
