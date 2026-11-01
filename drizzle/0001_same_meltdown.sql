ALTER TABLE `repositories` ADD `html_url` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `visibility` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `audience_role_id` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `category_id` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `overview_id` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `issues_id` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `pull_requests_id` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `activity_id` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `claim_token` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `claim_until` integer;--> statement-breakpoint
ALTER TABLE `repositories` ADD `registered_at` integer;