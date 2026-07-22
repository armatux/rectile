import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { FEATURE_STATUSES, PROJECT_STATUSES } from "@/db/schema";
import {
  addFeature,
  addLogEntry,
  createProject,
  getProjectDetail,
  listProjects,
  search,
  updateFeature,
  updateProject,
} from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_projects",
      "List all tracked projects with their status, priority, tags, feature progress (built/total), next action, and last-touched timestamp. Sorted stalest-first by default, so the top of the list is what most needs attention. Optionally filter by status or tag name.",
      {
        status: z.enum(PROJECT_STATUSES).optional().describe("Only return projects with this status"),
        tag: z.string().optional().describe("Only return projects carrying this tag name (case-insensitive)"),
      },
      async ({ status, tag }) => text(await listProjects({ status, tag })),
    );

    server.tool(
      "get_project",
      "Get one project by its slug, including the full feature roadmap (planned / in_progress / built), the most recent log entries (newest first), links, and tags. Use list_projects or search first if you don't know the slug.",
      { slug: z.string().describe("Project slug, e.g. 'fpv-drone-build'") },
      async ({ slug }) => text(await getProjectDetail(slug)),
    );

    server.tool(
      "create_project",
      "Create a new project. The slug is generated from the name automatically. New projects start as 'active' with priority 2 unless specified. Tags are created on the fly if they don't exist yet.",
      {
        name: z.string().describe("Human-readable project name"),
        description: z.string().optional().describe("What the project is, in a sentence or two"),
        category: z.string().optional().describe("Free-form category, e.g. 'hardware', 'infra'"),
        status: z.enum(PROJECT_STATUSES).optional().describe("Initial status (default: active)"),
        priority: z.number().int().min(1).max(3).optional().describe("1 = highest, 3 = lowest (default 2)"),
        tags: z.array(z.string()).optional().describe("Tag names to attach"),
      },
      async (input) => text(await createProject(input)),
    );

    server.tool(
      "update_project",
      "Update fields on an existing project (identified by slug). Only the fields you pass are changed. Passing 'tags' REPLACES the project's whole tag set. Setting status to 'done' or 'archived' removes it from the stale-projects radar.",
      {
        slug: z.string().describe("Slug of the project to update"),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        priority: z.number().int().min(1).max(3).optional(),
        tags: z.array(z.string()).optional().describe("Full replacement tag set"),
      },
      async ({ slug, ...fields }) => text(await updateProject(slug, fields)),
    );

    server.tool(
      "add_log_entry",
      "Append a journal entry (markdown allowed) to a project's log and bump its last-touched timestamp. Use this to record what was just done, decided, or discovered — e.g. after helping the user finish a piece of work on the project.",
      {
        slug: z.string().describe("Slug of the project to log against"),
        body: z.string().describe("Markdown body of the log entry, typically one to three sentences"),
      },
      async ({ slug, body }) => text(await addLogEntry(slug, body)),
    );

    server.tool(
      "add_feature",
      "Add a roadmap item (feature) to a project. Defaults to status 'planned'; pass 'in_progress' if work has started or 'built' if it's already done. It is appended to the end of its status column. Bumps the project's last-touched timestamp.",
      {
        slug: z.string().describe("Slug of the project"),
        title: z.string().describe("Short feature title, e.g. 'GPS rescue setup'"),
        status: z.enum(FEATURE_STATUSES).optional().describe("planned (default) | in_progress | built"),
      },
      async ({ slug, title, status }) => text(await addFeature(slug, { title, status })),
    );

    server.tool(
      "update_feature_status",
      "Move a feature to a different roadmap status. Moving to 'built' stamps completed_at; moving away clears it. Bumps the project's last-touched timestamp. Feature ids are returned by get_project.",
      {
        feature_id: z.number().int().describe("Numeric id of the feature"),
        status: z.enum(FEATURE_STATUSES).describe("Target status: planned | in_progress | built"),
      },
      async ({ feature_id, status }) => text(await updateFeature(feature_id, { status })),
    );

    server.tool(
      "search",
      "Full-text search across project names/descriptions, feature titles/descriptions, and log entries. Returns ranked hits with the owning project's slug and a highlighted snippet. Supports quoted phrases and OR/negation (websearch syntax).",
      { query: z.string().describe("Search query, e.g. 'betaflight' or \"alert rules\"") },
      async ({ query }) => text(await search(query)),
    );
  },
  {
    serverInfo: { name: "rectile", version: "1.0.0" },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
    disableSse: true,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
