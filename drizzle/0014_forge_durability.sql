ALTER TABLE "forge"."crafts" ADD COLUMN IF NOT EXISTS "raids_used" bigint DEFAULT 0 NOT NULL;

