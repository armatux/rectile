import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
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

/** Standalone reminders with an optional deadline. notifiedAt marks that the
 *  deadline push was sent (re-armed when a reminder is un-done). */
export const reminders = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** cadence only ("daily"|"weekly"|"monthly"|"yearly") — anchor is dueAt */
    repeat: text("repeat"),
    projectId: integer("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    index("reminders_due_idx").on(t.done, t.dueAt),
    index("reminders_project_idx").on(t.projectId),
  ],
);

/** Web Push subscriptions — one row per browser/device that enabled alerts. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("push_subs_endpoint_idx").on(t.endpoint)],
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
export type Reminder = typeof reminders.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Feature = typeof features.$inferSelect;
export type LogEntry = typeof logEntries.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Tag = typeof tags.$inferSelect;

export const PROJECT_STATUSES = projectStatus.enumValues;
export const FEATURE_STATUSES = featureStatus.enumValues;
