CREATE SCHEMA "forge";
--> statement-breakpoint
CREATE TABLE "forge"."crafts" (
	"craft_id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"player_name" text NOT NULL,
	"recipe_id" text NOT NULL,
	"status" text NOT NULL,
	"cost" jsonb NOT NULL,
	"started_at" bigint NOT NULL,
	"ready_at" bigint NOT NULL,
	"completed_at" bigint,
	"raids_used" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "crafts_player_idx" ON "forge"."crafts" USING btree ("player_id");