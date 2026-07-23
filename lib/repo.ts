import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  events,
  features,
  kv,
  links,
  logEntries,
  projects,
  projectTags,
  tags,
  type Feature,
  type Link,
  type LogEntry,
  type Project,
  type Tag,
} from "@/db/schema";
import { slugify } from "./slug";
import type {
  FeatureCreateInput,
  FeatureUpdateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
} from "./validators";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const now = () => new Date();

async function touch(projectId: number) {
  await db
    .update(projects)
    .set({ lastTouchedAt: now(), updatedAt: now() })
    .where(eq(projects.id, projectId));
}

/* ---------------------------------- events ---------------------------------- */

export type EventInput = {
  title: string;
  notes?: string;
  startsAt: Date;
  endsAt?: Date;
  allDay?: boolean;
};

export async function listEvents(from: Date, to: Date) {
  return db
    .select()
    .from(events)
    .where(and(gte(events.startsAt, from), lte(events.startsAt, to)))
    .orderBy(asc(events.startsAt));
}

export async function addEvent(input: EventInput) {
  const [row] = await db
    .insert(events)
    .values({
      title: input.title,
      notes: input.notes ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      allDay: input.allDay ?? false,
    })
    .returning();
  return row;
}

export async function deleteEvent(id: number): Promise<void> {
  const res = await db.delete(events).where(eq(events.id, id)).returning();
  if (!res.length) throw new NotFoundError(`no event ${id}`);
}

/* ------------------------------------ kv ------------------------------------ */

export async function getKv<T = unknown>(
  key: string,
): Promise<{ value: T; updatedAt: Date } | null> {
  const rows = await db.select().from(kv).where(eq(kv.key, key));
  if (!rows.length) return null;
  return { value: rows[0].value as T, updatedAt: rows[0].updatedAt };
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await db
    .insert(kv)
    .values({ key, value, updatedAt: now() })
    .onConflictDoUpdate({ target: kv.key, set: { value, updatedAt: now() } });
}

/* ---------------------------------- projects --------------------------------- */

export type ProjectSummary = Project & {
  tags: Tag[];
  featuresTotal: number;
  featuresBuilt: number;
  featuresInProgress: number;
  nextAction: string | null;
};

export type ProjectDetail = ProjectSummary & {
  features: Feature[];
  logEntries: LogEntry[];
  links: Link[];
};

function summarize(
  p: Project & {
    projectTags: { tag: Tag }[];
    features: Feature[];
  },
): ProjectSummary {
  const fs = p.features;
  const inProgress = fs
    .filter((f) => f.status === "in_progress")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const planned = fs
    .filter((f) => f.status === "planned")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const { projectTags: pt, features: allFeatures, ...rest } = p;
  void allFeatures;
  return {
    ...rest,
    tags: pt.map((x) => x.tag).sort((a, b) => a.name.localeCompare(b.name)),
    featuresTotal: fs.length,
    featuresBuilt: fs.filter((f) => f.status === "built").length,
    featuresInProgress: inProgress.length,
    nextAction: inProgress[0]?.title ?? planned[0]?.title ?? null,
  };
}

export type ListProjectsOpts = {
  status?: Project["status"];
  tag?: string;
  sort?: "staleness" | "priority" | "name" | "updated" | "created";
};

export async function listProjects(
  opts: ListProjectsOpts = {},
): Promise<ProjectSummary[]> {
  const rows = await db.query.projects.findMany({
    where: opts.status ? eq(projects.status, opts.status) : undefined,
    with: { projectTags: { with: { tag: true } }, features: true },
  });
  let out = rows.map(summarize);
  if (opts.tag) {
    const t = opts.tag.toLowerCase();
    out = out.filter((p) => p.tags.some((x) => x.name.toLowerCase() === t));
  }
  const sort = opts.sort ?? "staleness";
  out.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "priority":
        return a.priority - b.priority || cmpTouched(a, b);
      case "updated":
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      case "created":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "staleness":
      default:
        return cmpTouched(a, b);
    }
  });
  return out;
}

function cmpTouched(a: Project, b: Project) {
  return a.lastTouchedAt.getTime() - b.lastTouchedAt.getTime();
}

export async function getProjectDetail(slug: string): Promise<ProjectDetail> {
  const p = await db.query.projects.findFirst({
    where: eq(projects.slug, slug),
    with: {
      projectTags: { with: { tag: true } },
      features: {
        orderBy: [asc(features.sortOrder), asc(features.id)],
      },
      logEntries: {
        orderBy: [desc(logEntries.createdAt), desc(logEntries.id)],
        limit: 200,
      },
      links: { orderBy: [asc(links.id)] },
    },
  });
  if (!p) throw new NotFoundError(`project not found: ${slug}`);
  const { logEntries: logs, links: lnks, ...core } = p;
  return { ...summarize(core), features: core.features, logEntries: logs, links: lnks };
}

async function requireProject(slug: string): Promise<Project> {
  const p = await db.query.projects.findFirst({ where: eq(projects.slug, slug) });
  if (!p) throw new NotFoundError(`project not found: ${slug}`);
  return p;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  const taken = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(sql`${projects.slug} ~ ${`^${base}(-[0-9]+)?$`}`);
  if (!taken.some((r) => r.slug === base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.some((r) => r.slug === candidate)) return candidate;
  }
}

export async function createProject(
  input: ProjectCreateInput,
): Promise<ProjectDetail> {
  const slug = await uniqueSlug(input.name);
  const [row] = await db
    .insert(projects)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      category: input.category ?? null,
      status: input.status ?? "active",
      priority: input.priority ?? 2,
    })
    .returning();
  if (input.tags?.length) await setProjectTags(row.id, input.tags);
  return getProjectDetail(slug);
}

export async function updateProject(
  slug: string,
  input: ProjectUpdateInput,
): Promise<ProjectDetail> {
  const p = await requireProject(slug);
  const { tags: tagNames, ...fields } = input;
  if (Object.keys(fields).length > 0) {
    await db
      .update(projects)
      .set({ ...fields, updatedAt: now() })
      .where(eq(projects.id, p.id));
  }
  if (tagNames) await setProjectTags(p.id, tagNames);
  return getProjectDetail(slug);
}

export async function deleteProject(slug: string): Promise<void> {
  const p = await requireProject(slug);
  await db.delete(projects).where(eq(projects.id, p.id));
}

/* ------------------------------------ tags ----------------------------------- */

const TAG_COLORS = ["#b39cf5", "#8be0b9", "#e5c07b", "#7cc7e8", "#e06c75", "#d4a3e0"];

export async function setProjectTags(projectId: number, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const tagRows: Tag[] = [];
  for (const name of clean) {
    const existing = await db.query.tags.findFirst({
      where: sql`lower(${tags.name}) = ${name.toLowerCase()}`,
    });
    if (existing) {
      tagRows.push(existing);
    } else {
      const count = await db.$count(tags);
      const [created] = await db
        .insert(tags)
        .values({ name, color: TAG_COLORS[count % TAG_COLORS.length] })
        .returning();
      tagRows.push(created);
    }
  }
  await db.delete(projectTags).where(eq(projectTags.projectId, projectId));
  if (tagRows.length) {
    await db
      .insert(projectTags)
      .values(tagRows.map((t) => ({ projectId, tagId: t.id })))
      .onConflictDoNothing();
  }
}

export async function listTags(): Promise<(Tag & { projectCount: number })[]> {
  const rows = await db.query.tags.findMany({
    with: { projectTags: true },
    orderBy: [asc(tags.name)],
  });
  return rows.map(({ projectTags: pt, ...t }) => ({ ...t, projectCount: pt.length }));
}

export async function createTag(input: { name: string; color?: string }): Promise<Tag> {
  const existing = await db.query.tags.findFirst({
    where: sql`lower(${tags.name}) = ${input.name.toLowerCase()}`,
  });
  if (existing) throw new ConflictError(`tag already exists: ${input.name}`);
  const count = await db.$count(tags);
  const [row] = await db
    .insert(tags)
    .values({ name: input.name, color: input.color ?? TAG_COLORS[count % TAG_COLORS.length] })
    .returning();
  return row;
}

export async function updateTag(
  id: number,
  input: { name?: string; color?: string },
): Promise<Tag> {
  const [row] = await db.update(tags).set(input).where(eq(tags.id, id)).returning();
  if (!row) throw new NotFoundError(`tag not found: ${id}`);
  return row;
}

export async function deleteTag(id: number): Promise<void> {
  const res = await db.delete(tags).where(eq(tags.id, id)).returning();
  if (!res.length) throw new NotFoundError(`tag not found: ${id}`);
}

/* ---------------------------------- features --------------------------------- */

export async function addFeature(
  slug: string,
  input: FeatureCreateInput,
): Promise<Feature> {
  const p = await requireProject(slug);
  const status = input.status ?? "planned";
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${features.sortOrder}), 0)` })
    .from(features)
    .where(and(eq(features.projectId, p.id), eq(features.status, status)));
  const [row] = await db
    .insert(features)
    .values({
      projectId: p.id,
      title: input.title,
      description: input.description ?? null,
      status,
      sortOrder: Number(max) + 1,
      completedAt: status === "built" ? now() : null,
    })
    .returning();
  await touch(p.id);
  return row;
}

export async function updateFeature(
  id: number,
  input: FeatureUpdateInput,
): Promise<Feature> {
  const existing = await db.query.features.findFirst({ where: eq(features.id, id) });
  if (!existing) throw new NotFoundError(`feature not found: ${id}`);
  const patch: Partial<Feature> = { ...input };
  const statusChanged = input.status !== undefined && input.status !== existing.status;
  if (statusChanged) {
    patch.completedAt = input.status === "built" ? now() : null;
    if (input.sortOrder === undefined) {
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${features.sortOrder}), 0)` })
        .from(features)
        .where(
          and(
            eq(features.projectId, existing.projectId),
            eq(features.status, input.status!),
          ),
        );
      patch.sortOrder = Number(max) + 1;
    }
  }
  const [row] = await db
    .update(features)
    .set(patch)
    .where(eq(features.id, id))
    .returning();
  if (statusChanged) await touch(existing.projectId);
  return row;
}

export async function deleteFeature(id: number): Promise<void> {
  const res = await db.delete(features).where(eq(features.id, id)).returning();
  if (!res.length) throw new NotFoundError(`feature not found: ${id}`);
}

/** Persist an explicit ordering of feature ids within one status column. */
export async function reorderFeatures(
  slug: string,
  status: Feature["status"],
  orderedIds: number[],
): Promise<void> {
  const p = await requireProject(slug);
  const rows = await db.query.features.findMany({
    where: and(eq(features.projectId, p.id), inArray(features.id, orderedIds)),
  });
  const valid = new Set(rows.map((r) => r.id));
  let order = 1;
  for (const id of orderedIds) {
    if (!valid.has(id)) continue;
    await db
      .update(features)
      .set({ sortOrder: order++, status })
      .where(eq(features.id, id));
  }
}

/* ------------------------------------ logs ----------------------------------- */

export async function addLogEntry(slug: string, body: string): Promise<LogEntry> {
  const p = await requireProject(slug);
  const [row] = await db
    .insert(logEntries)
    .values({ projectId: p.id, body })
    .returning();
  await touch(p.id);
  return row;
}

export async function deleteLogEntry(id: number): Promise<void> {
  const res = await db.delete(logEntries).where(eq(logEntries.id, id)).returning();
  if (!res.length) throw new NotFoundError(`log entry not found: ${id}`);
}

/* ------------------------------------ links ---------------------------------- */

export async function addLink(
  slug: string,
  input: { label: string; url: string },
): Promise<Link> {
  const p = await requireProject(slug);
  const [row] = await db
    .insert(links)
    .values({ projectId: p.id, label: input.label, url: input.url })
    .returning();
  return row;
}

export async function updateLink(
  id: number,
  input: { label?: string; url?: string },
): Promise<Link> {
  const [row] = await db.update(links).set(input).where(eq(links.id, id)).returning();
  if (!row) throw new NotFoundError(`link not found: ${id}`);
  return row;
}

export async function deleteLink(id: number): Promise<void> {
  const res = await db.delete(links).where(eq(links.id, id)).returning();
  if (!res.length) throw new NotFoundError(`link not found: ${id}`);
}

/* ----------------------------------- search ---------------------------------- */

export type SearchHit = {
  kind: "project" | "feature" | "log_entry";
  projectSlug: string;
  projectName: string;
  title: string;
  snippet: string;
  rank: number;
  refId: number;
};

export async function search(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await db.execute(sql`
    (
      SELECT 'project' AS kind, p.slug AS project_slug, p.name AS project_name,
             p.name AS title,
             ts_headline('english', coalesce(p.description, p.name),
                         websearch_to_tsquery('english', ${q}),
                         'MaxFragments=1, MaxWords=18, MinWords=6') AS snippet,
             ts_rank(p.search, websearch_to_tsquery('english', ${q})) AS rank,
             p.id AS ref_id
      FROM projects p
      WHERE p.search @@ websearch_to_tsquery('english', ${q})
    )
    UNION ALL
    (
      SELECT 'feature', p.slug, p.name, f.title,
             ts_headline('english', coalesce(f.description, f.title),
                         websearch_to_tsquery('english', ${q}),
                         'MaxFragments=1, MaxWords=18, MinWords=6'),
             ts_rank(f.search, websearch_to_tsquery('english', ${q})),
             f.id
      FROM features f JOIN projects p ON p.id = f.project_id
      WHERE f.search @@ websearch_to_tsquery('english', ${q})
    )
    UNION ALL
    (
      SELECT 'log_entry', p.slug, p.name, 'log · ' || to_char(l.created_at, 'YYYY-MM-DD'),
             ts_headline('english', l.body,
                         websearch_to_tsquery('english', ${q}),
                         'MaxFragments=1, MaxWords=18, MinWords=6'),
             ts_rank(l.search, websearch_to_tsquery('english', ${q})),
             l.id
      FROM log_entries l JOIN projects p ON p.id = l.project_id
      WHERE l.search @@ websearch_to_tsquery('english', ${q})
    )
    ORDER BY rank DESC
    LIMIT 40
  `);
  return (res as unknown as Record<string, unknown>[]).map((r) => ({
    kind: r.kind as SearchHit["kind"],
    projectSlug: r.project_slug as string,
    projectName: r.project_name as string,
    title: r.title as string,
    snippet: r.snippet as string,
    rank: Number(r.rank),
    refId: Number(r.ref_id),
  }));
}

/* ----------------------------------- vitals ---------------------------------- */

export type Vitals = {
  activeProjects: number;
  avgProgress: number;
  hotCount: number; // non-done projects untouched >= 7 days
  longestIdleDays: number;
  longestIdleName: string | null;
  activity: number[]; // log entries + completed features per day, last 14 days
};

export async function getVitals(all: ProjectSummary[]): Promise<Vitals> {
  const live = all.filter((p) => p.status === "active" || p.status === "paused");
  const tracked = all.filter((p) => p.status !== "done" && p.status !== "archived");
  const withFeatures = live.filter((p) => p.featuresTotal > 0);
  const avg = withFeatures.length
    ? Math.round(
        (withFeatures.reduce((s, p) => s + p.featuresBuilt / p.featuresTotal, 0) /
          withFeatures.length) *
          100,
      )
    : 0;
  const msDay = 86_400_000;
  const idleDays = (p: ProjectSummary) =>
    Math.floor((Date.now() - p.lastTouchedAt.getTime()) / msDay);
  const hot = tracked.filter((p) => idleDays(p) >= 7);
  const idlest = [...tracked].sort(cmpTouched)[0];
  const res = await db.execute(sql`
    SELECT d::date AS day, count(l.id) AS n
    FROM generate_series(now() - interval '13 days', now(), interval '1 day') d
    LEFT JOIN log_entries l ON l.created_at::date = d::date
    GROUP BY 1 ORDER BY 1
  `);
  const activity = (res as unknown as { n: string }[]).map((r) => Number(r.n));
  return {
    activeProjects: live.length,
    avgProgress: avg,
    hotCount: hot.length,
    longestIdleDays: idlest ? idleDays(idlest) : 0,
    longestIdleName: idlest?.name ?? null,
    activity,
  };
}
