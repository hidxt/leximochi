CREATE TABLE `review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`event_id` text NOT NULL,
	`question_type` text NOT NULL,
	`answer_raw` text NOT NULL,
	`is_correct` integer NOT NULL,
	`rating` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`answered_at` integer NOT NULL,
	`client_answered_at` integer,
	`ease_factor_after` real NOT NULL,
	`interval_days_after` real NOT NULL,
	`repetitions_after` integer NOT NULL,
	`due_at_after` integer NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_logs_event_id_unique` ON `review_logs` (`event_id`);--> statement-breakpoint
CREATE INDEX `review_logs_user_time_idx` ON `review_logs` (`user_id`,`answered_at`);--> statement-breakpoint
CREATE INDEX `review_logs_user_word_idx` ON `review_logs` (`user_id`,`word_id`);--> statement-breakpoint
CREATE TABLE `spelling_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`review_log_id` text NOT NULL,
	`expected` text NOT NULL,
	`actual` text NOT NULL,
	`error_types` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_log_id`) REFERENCES `review_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spelling_errors_user_word_idx` ON `spelling_errors` (`user_id`,`word_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_notebook` (
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`note` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_notebook_added_idx` ON `user_notebook` (`user_id`,`added_at`);--> statement-breakpoint
CREATE TABLE `user_word_states` (
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`interval_days` real DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_at` integer,
	`last_reviewed_at` integer,
	`first_learned_at` integer,
	`total_reviews` integer DEFAULT 0 NOT NULL,
	`correct_reviews` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_word_states_due_idx` ON `user_word_states` (`user_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `user_word_states_status_idx` ON `user_word_states` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `word_ai_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`memory_tip` text,
	`usage_note` text,
	`confusable_note` text,
	`extra_examples_json` text,
	`provider` text,
	`model` text,
	`generated_at` integer,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_ai_notes_word_unique` ON `word_ai_notes` (`word_id`);--> statement-breakpoint
CREATE TABLE `word_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`sense_id` text,
	`text_en` text NOT NULL,
	`text_zh` text NOT NULL,
	`audio_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `word_examples_word_idx` ON `word_examples` (`word_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `word_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`form_type` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `word_forms_word_idx` ON `word_forms` (`word_id`);--> statement-breakpoint
CREATE TABLE `word_phrases` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`kind` text DEFAULT 'phrase' NOT NULL,
	`text` text NOT NULL,
	`translation` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `word_phrases_word_idx` ON `word_phrases` (`word_id`,`kind`,`sort_order`);--> statement-breakpoint
CREATE TABLE `word_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`target_word_id` text,
	`target_text` text,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `word_relations_word_idx` ON `word_relations` (`word_id`,`relation_type`);--> statement-breakpoint
CREATE TABLE `word_senses` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`part_of_speech` text,
	`definition_zh` text NOT NULL,
	`definition_en` text,
	`exam_meaning` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `word_senses_word_idx` ON `word_senses` (`word_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `wordbook_entries` (
	`wordbook_id` text NOT NULL,
	`word_id` text NOT NULL,
	`rank` integer,
	`tags_json` text,
	PRIMARY KEY(`wordbook_id`, `word_id`),
	FOREIGN KEY (`wordbook_id`) REFERENCES `wordbooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wordbook_entries_rank_idx` ON `wordbook_entries` (`wordbook_id`,`rank`);--> statement-breakpoint
CREATE TABLE `wordbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`language` text DEFAULT 'en' NOT NULL,
	`is_system` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wordbooks_key_unique` ON `wordbooks` (`key`);--> statement-breakpoint
CREATE TABLE `words` (
	`id` text PRIMARY KEY NOT NULL,
	`headword` text NOT NULL,
	`headword_canonical` text NOT NULL,
	`phonetic_uk` text,
	`phonetic_us` text,
	`audio_uk_key` text,
	`audio_us_key` text,
	`source` text DEFAULT 'dictionary' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `words_headword_canonical_unique` ON `words` (`headword_canonical`);