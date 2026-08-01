ALTER TABLE `config_effectivity` ADD `article_scope` text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE `config_effectivity` ADD `stand_scope` text DEFAULT 'any' NOT NULL;--> statement-breakpoint
UPDATE `config_effectivity` SET `article_scope` = CASE
  WHEN `any_article` = 0 THEN 'explicit'
  WHEN `serial_from` IS NOT NULL OR `serial_to` IS NOT NULL THEN 'serial_range'
  ELSE 'any'
END;--> statement-breakpoint
UPDATE `config_effectivity` SET `stand_scope` = CASE
  WHEN `any_stand` = 0 THEN 'explicit'
  ELSE 'any'
END;