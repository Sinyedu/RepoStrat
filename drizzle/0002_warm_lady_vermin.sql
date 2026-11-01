CREATE TABLE `synced_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`github_repository_id` text NOT NULL,
	`item_type` text NOT NULL,
	`github_item_id` text NOT NULL,
	`number` integer NOT NULL,
	`channel_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`starter_message_id` text,
	`content_hash` text NOT NULL,
	`github_updated_at` integer NOT NULL,
	`last_synced_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`,`github_repository_id`) REFERENCES `repositories`(`guild_id`,`github_repository_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `synced_items_identity` ON `synced_items` (`guild_id`,`github_repository_id`,`item_type`,`github_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `synced_items_thread` ON `synced_items` (`thread_id`);--> statement-breakpoint
CREATE INDEX `synced_items_repository` ON `synced_items` (`guild_id`,`github_repository_id`);