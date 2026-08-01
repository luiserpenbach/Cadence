DROP INDEX IF EXISTS `procedures_key_uidx`;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `procedures_key_version_uidx` ON `procedures` (`key`,`version`);