ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "repeat" text;
--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_project_idx" ON "reminders" ("project_id");
