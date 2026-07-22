-- Full-text search: generated tsvector columns + GIN indexes.
ALTER TABLE "projects" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("category", '')), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX "projects_search_idx" ON "projects" USING gin ("search");--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B')
) STORED;--> statement-breakpoint
CREATE INDEX "features_search_idx" ON "features" USING gin ("search");--> statement-breakpoint
ALTER TABLE "log_entries" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce("body", ''))
) STORED;--> statement-breakpoint
CREATE INDEX "log_entries_search_idx" ON "log_entries" USING gin ("search");
