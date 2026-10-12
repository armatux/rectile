import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const projectStatus = pgEnum("project_status", [
  "active",
  "paused",
  "idea",
  "done",
  "archived",
]);

export const featureStatus = pgEnum("feature_status", [
  "planned",
  "in_progress",
  "built",
]);

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: projectStatus("status").notNull().default("active"),
    category: text("category"),
    priority: integer("priority").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastTouchedAt: timestamp("last_touched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("projects_slug_idx").on(t.slug)],
);

export const features = pgTable(
  "features",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: featureStatus("status").notNull().default("planned"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("features_project_idx").on(t.projectId)],
);

export const logEntries = pgTable(
  "log_entries",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("log_entries_project_idx").on(t.projectId, t.createdAt)],
);

export const links = pgTable(
  "links",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
  },
  (t) => [index("links_project_idx").on(t.projectId)],
);

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#b39cf5"),
  },
  (t) => [uniqueIndex("tags_name_idx").on(t.name)],
);

export const projectTags = pgTable(
  "project_tags",
  {
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.tagId] })],
);

/** Local calendar events. Subscribed (ICS/Proton) events are NOT stored
 *  here — they are fetched + cached at render time and merged read-only. */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("events_starts_idx").on(t.startsAt)],
);

/** Free-form JSON store for external integrations (e.g. cpptutor progress
 *  pushed by rectile_sync.py) — one row per widget/integration key. */
export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------- Vestige orchestrator tickets ------------------------- */

/** Who is calling: the owner, the orchestrator service, or one of its agents. */
export const actorEnum = pgEnum("actor", ["human", "orchestrator", "code", "visual"]);

export const ticketKind = pgEnum("ticket_kind", ["task", "contract_change"]);

export const ticketSource = pgEnum("ticket_source", ["manual", "prompt", "review"]);

export const ticketOwner = pgEnum("ticket_owner", ["code", "visual", "human"]);

export const ticketStatus = pgEnum("ticket_status", [
  "triage",
  "queued",
  "in_progress",
  "blocked_on_question",
  "paused",
  "gate_running",
  "ready_for_review",
  "changes_requested",
  "approved",
  "done",
  "failed",
  "cancelled",
]);

export const ticketEventType = pgEnum("ticket_event_type", [
  "comment",
  "question",
  "answer",
  "handoff",
  "gate_result",
  "approval",
  "rejection",
  "status_change",
  "lock",
  "system",
]);

/** `<prefix>-<n>` ticket keys; never reused (sequences don't roll back). */
export const ticketKeySeq = pgSequence("ticket_key_seq");

/** Global change counter: every ticket write (and every event/attachment
 *  added to a ticket) stamps the ticket with the next value. Pollers ask
 *  for `seq > cursor`. */
export const ticketChangeSeq = pgSequence("ticket_change_seq");

/** Per-actor bearer tokens. Only the SHA-256 of the raw token is stored. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: serial("id").primaryKey(),
    actor: actorEnum("actor").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_tokens_token_hash_idx").on(t.tokenHash)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    projectId: integer("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    kind: ticketKind("kind").notNull().default("task"),
    source: ticketSource("source").notNull().default("manual"),
    ownerAgent: ticketOwner("owner_agent").notNull(),
    status: ticketStatus("status").notNull().default("triage"),
    priority: integer("priority").notNull().default(2),
    acceptanceCriteria: text("acceptance_criteria"),
    /** project-relative globs, e.g. `Source/tha_game/Ghost/**` */
    touchedPaths: jsonb("touched_paths").$type<string[]>().notNull().default([]),
    /** `id@version` strings */
    linkedContracts: jsonb("linked_contracts")
      .$type<string[]>()
      .notNull()
      .default([]),
    model: text("model"),
    effort: text("effort"),
    /** visual agent only: `editor` | `screen` (null = editor) */
    mode: text("mode"),
    /** the agent's pending/shelved Perforce changelist */
    changelist: integer("changelist"),
    createdBy: actorEnum("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
    seq: bigint("seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('ticket_change_seq')`),
  },
  (t) => [
    uniqueIndex("tickets_key_idx").on(t.key),
    uniqueIndex("tickets_seq_idx").on(t.seq),
    index("tickets_project_idx").on(t.projectId),
  ],
);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actor: actorEnum("actor").notNull(),
    type: ticketEventType("type").notNull(),
    body: text("body").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketId, t.id)],
);

export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actor: actorEnum("actor").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sha256: text("sha256").notNull(),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ticket_attachments_ticket_idx").on(t.ticketId)],
);

export const projectsRelations = relations(projects, ({ many }) => ({
  features: many(features),
  logEntries: many(logEntries),
  links: many(links),
  projectTags: many(projectTags),
}));

export const featuresRelations = relations(features, ({ one }) => ({
  project: one(projects, {
    fields: [features.projectId],
    references: [projects.id],
  }),
}));

export const logEntriesRelations = relations(logEntries, ({ one }) => ({
  project: one(projects, {
    fields: [logEntries.projectId],
    references: [projects.id],
  }),
}));

export const linksRelations = relations(links, ({ one }) => ({
  project: one(projects, {
    fields: [links.projectId],
    references: [projects.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  projectTags: many(projectTags),
}));

export const projectTagsRelations = relations(projectTags, ({ one }) => ({
  project: one(projects, {
    fields: [projectTags.projectId],
    references: [projects.id],
  }),
  tag: one(tags, { fields: [projectTags.tagId], references: [tags.id] }),
}));

export type Project = typeof projects.$inferSelect;
export type Feature = typeof features.$inferSelect;
export type LogEntry = typeof logEntries.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type TicketEvent = typeof ticketEvents.$inferSelect;
export type TicketAttachment = typeof ticketAttachments.$inferSelect;
export type Actor = (typeof actorEnum.enumValues)[number];
export type TicketStatus = (typeof ticketStatus.enumValues)[number];
export type TicketOwner = (typeof ticketOwner.enumValues)[number];
export type TicketEventType = (typeof ticketEventType.enumValues)[number];

export const PROJECT_STATUSES = projectStatus.enumValues;
export const FEATURE_STATUSES = featureStatus.enumValues;
export const ACTORS = actorEnum.enumValues;
export const TICKET_KINDS = ticketKind.enumValues;
export const TICKET_SOURCES = ticketSource.enumValues;
export const TICKET_OWNERS = ticketOwner.enumValues;
export const TICKET_STATUSES = ticketStatus.enumValues;
export const TICKET_EVENT_TYPES = ticketEventType.enumValues;
export const TICKET_MODES = ["editor", "screen"] as const;
