-- Vestige orchestrator tickets: per-actor API tokens, tickets polled by a
-- global change sequence, an event timeline and attachments.
-- Additive only: new types, sequences, tables and indexes.
DO $$ BEGIN
 CREATE TYPE "public"."actor" AS ENUM('human', 'orchestrator', 'code', 'visual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_kind" AS ENUM('task', 'contract_change');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_source" AS ENUM('manual', 'prompt', 'review');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_owner" AS ENUM('code', 'visual', 'human');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_status" AS ENUM('triage', 'queued', 'in_progress', 'blocked_on_question', 'paused', 'gate_running', 'ready_for_review', 'changes_requested', 'approved', 'done', 'failed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_event_type" AS ENUM('comment', 'question', 'answer', 'handoff', 'gate_result', 'approval', 'rejection', 'status_change', 'lock', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."ticket_key_seq";--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."ticket_change_seq";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" "actor" NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"project_id" integer CONSTRAINT "tickets_project_id_projects_id_fk" REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action,
	"title" text NOT NULL,
	"description" text,
	"kind" "ticket_kind" DEFAULT 'task' NOT NULL,
	"source" "ticket_source" DEFAULT 'manual' NOT NULL,
	"owner_agent" "ticket_owner" NOT NULL,
	"status" "ticket_status" DEFAULT 'triage' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"acceptance_criteria" text,
	"touched_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_contracts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"effort" text,
	"mode" text,
	"changelist" integer,
	"created_by" "actor" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('ticket_change_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action,
	"actor" "actor" NOT NULL,
	"type" "ticket_event_type" NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action,
	"actor" "actor" NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text,
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_tokens_token_hash_idx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_key_idx" ON "tickets" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_seq_idx" ON "tickets" USING btree ("seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_project_idx" ON "tickets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_attachments_ticket_idx" ON "ticket_attachments" USING btree ("ticket_id");
