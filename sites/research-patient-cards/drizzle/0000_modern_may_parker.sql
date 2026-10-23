CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `patient_cards` (
	`code` text PRIMARY KEY NOT NULL,
	`sections` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "sections_json" CHECK(json_valid("patient_cards"."sections"))
);
