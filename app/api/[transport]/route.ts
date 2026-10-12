import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import {
  FEATURE_STATUSES,
  PROJECT_STATUSES,
  TICKET_KINDS,
  TICKET_MODES,
  TICKET_OWNERS,
  TICKET_SOURCES,
  TICKET_STATUSES,
  type Actor,
} from "@/db/schema";
import { isActor } from "@/lib/actor";
import { requireActor } from "@/lib/api";
import {
  addFeature,
  addLogEntry,
  createProject,
  ForbiddenError,
  getProjectDetail,
  listProjects,
  search,
  updateFeature,
  updateProject,
} from "@/lib/repo";
import { forbiddenStatusMessage } from "@/lib/ticketGuard";
import { addTicketEvent, createTicket, getTicket, listTickets } from "@/lib/tickets";
import { ticketCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

/** Tool callbacks see the caller through the auth info set by withMcpAuth. */
type ToolExtra = { authInfo?: { extra?: Record<string, unknown> } };

function callerOf(extra: ToolExtra): Actor {
  const actor = extra.authInfo?.extra?.actor;
  if (!isActor(actor)) throw new Error("unauthorized: no actor on this MCP request");
  return actor;
}

/** Agent tokens are read-only outside tickets (same rule as middleware). */
function legacyWriter(extra: ToolExtra): Actor {
  const actor = callerOf(extra);
  if (actor === "code" || actor === "visual") {
    throw new ForbiddenError(`forbidden: ${actor} may not modify projects`);
  }
  return actor;
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
      async (input, extra) => {
        legacyWriter(extra);
        return text(await createProject(input));
      },
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
      async ({ slug, ...fields }, extra) => {
        legacyWriter(extra);
        return text(await updateProject(slug, fields));
      },
    );

    server.tool(
      "add_log_entry",
      "Append a journal entry (markdown allowed) to a project's log and bump its last-touched timestamp. Use this to record what was just done, decided, or discovered — e.g. after helping the user finish a piece of work on the project.",
      {
        slug: z.string().describe("Slug of the project to log against"),
        body: z.string().describe("Markdown body of the log entry, typically one to three sentences"),
      },
      async ({ slug, body }, extra) => {
        legacyWriter(extra);
        return text(await addLogEntry(slug, body));
      },
    );

    server.tool(
      "add_feature",
      "Add a roadmap item (feature) to a project. Defaults to status 'planned'; pass 'in_progress' if work has started or 'built' if it's already done. It is appended to the end of its status column. Bumps the project's last-touched timestamp.",
      {
        slug: z.string().describe("Slug of the project"),
        title: z.string().describe("Short feature title, e.g. 'GPS rescue setup'"),
        status: z.enum(FEATURE_STATUSES).optional().describe("planned (default) | in_progress | built"),
      },
      async ({ slug, title, status }, extra) => {
        legacyWriter(extra);
        return text(await addFeature(slug, { title, status }));
      },
    );

    server.tool(
      "update_feature_status",
      "Move a feature to a different roadmap status. Moving to 'built' stamps completed_at; moving away clears it. Bumps the project's last-touched timestamp. Feature ids are returned by get_project.",
      {
        feature_id: z.number().int().describe("Numeric id of the feature"),
        status: z.enum(FEATURE_STATUSES).describe("Target status: planned | in_progress | built"),
      },
      async ({ feature_id, status }, extra) => {
        legacyWriter(extra);
        return text(await updateFeature(feature_id, { status }));
      },
    );

    server.tool(
      "search",
      "Full-text search across project names/descriptions, feature titles/descriptions, and log entries. Returns ranked hits with the owning project's slug and a highlighted snippet. Supports quoted phrases and OR/negation (websearch syntax).",
      { query: z.string().describe("Search query, e.g. 'betaflight' or \"alert rules\"") },
      async ({ query }) => text(await search(query)),
    );

    /* ------------------------ Vestige orchestrator tickets ------------------------ */

    server.tool(
      "list_tickets",
      "List Vestige orchestrator tickets, ordered by change sequence (least recently changed first). Optionally filter by status and/or owner agent. Returns { tickets, maxSeq }; pass since_seq = maxSeq to get only what changed since.",
      {
        status: z.enum(TICKET_STATUSES).optional().describe("Only tickets in this status"),
        owner: z.enum(TICKET_OWNERS).optional().describe("Only tickets owned by this agent: code | visual | human"),
        since_seq: z.number().int().min(0).optional().describe("Only tickets changed after this seq"),
      },
      async ({ status, owner, since_seq }, extra) => {
        callerOf(extra);
        return text(await listTickets({ status, owner, sinceSeq: since_seq }));
      },
    );

    server.tool(
      "get_ticket",
      "Get one ticket by key (e.g. 'VC-12') with its full event timeline (comments, questions, handoffs, gate results, approvals, status changes) and attachments.",
      { key: z.string().describe("Ticket key, e.g. 'VC-12'") },
      async ({ key }, extra) => {
        callerOf(extra);
        return text(await getTicket(key));
      },
    );

    server.tool(
      "create_ticket",
      "Create a ticket for the Vestige orchestrator. New tickets start in 'triage'; only the owner (human token) may create one directly in another status. ownerAgent picks who works it: code | visual | human.",
      {
        title: z.string().describe("Short imperative title"),
        ownerAgent: z.enum(TICKET_OWNERS).describe("code | visual | human"),
        description: z.string().optional().describe("What and why, in a few sentences"),
        acceptanceCriteria: z.string().optional().describe("How a reviewer decides it is done"),
        kind: z.enum(TICKET_KINDS).optional().describe("task (default) | contract_change"),
        source: z.enum(TICKET_SOURCES).optional().describe("manual (default) | prompt | review"),
        priority: z.number().int().min(1).max(3).optional().describe("1 = highest, 3 = lowest (default 2)"),
        touchedPaths: z.array(z.string()).optional().describe("Project-relative globs, e.g. 'Source/tha_game/Ghost/**'"),
        linkedContracts: z.array(z.string()).optional().describe("'id@version' strings"),
        model: z.string().optional().describe("Per-ticket model override"),
        effort: z.string().optional().describe("Per-ticket effort override"),
        mode: z.enum(TICKET_MODES).optional().describe("Visual agent only: editor (default) | screen"),
        status: z.enum(TICKET_STATUSES).optional().describe("Initial status — non-triage needs a human token"),
        projectSlug: z.string().optional().describe("Link to a rectile project by slug"),
      },
      async (args, extra) => {
        const actor = callerOf(extra);
        const input = ticketCreateSchema.parse(args);
        if (actor !== "human" && input.status && input.status !== "triage") {
          throw new ForbiddenError(forbiddenStatusMessage(actor, input.status));
        }
        return text(await createTicket(actor, input));
      },
    );

    server.tool(
      "comment_ticket",
      "Add a comment to a ticket's timeline as the calling actor. Moves the ticket up the orchestrator's change feed.",
      {
        key: z.string().describe("Ticket key, e.g. 'VC-12'"),
        body: z.string().min(1).describe("Comment text"),
      },
      async ({ key, body }, extra) => {
        const actor = callerOf(extra);
        return text(await addTicketEvent(actor, key, { type: "comment", body }));
      },
    );
  },
  {
    serverInfo: { name: "rectile", version: "1.1.0" },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
    disableSse: true,
  },
);

/**
 * The bearer token was already checked by middleware.ts; this just turns
 * its signed actor headers into MCP auth info (the raw token is never
 * carried along). Missing/forged headers → 401.
 */
const authed = withMcpAuth(
  handler,
  (req) => {
    try {
      const { actor, tokenName } = requireActor(req);
      return { token: "", clientId: tokenName, scopes: [], extra: { actor } };
    } catch {
      return undefined;
    }
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
