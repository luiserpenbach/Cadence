CREATE TABLE `catalog_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`categories_json` text DEFAULT '[]' NOT NULL,
	`prefixes_json` text DEFAULT '[]' NOT NULL
);
