ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "event_id" integer REFERENCES "events"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_event_idx" ON "reminders" ("event_id");
