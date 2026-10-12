import { and, asc, desc, eq, gt, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  ticketAttachments,
  ticketEvents,
  tickets,
  type Actor,
  type Ticket,
  type TicketAttachment,
  type TicketEvent,
  type TicketOwner,
  type TicketStatus,
} from "@/db/schema";
import {
  canAddEvent,
  canPatchTickets,
  canSetStatus,
  forbiddenStatusMessage,
} from "./ticketGuard";
import { ConflictError, ForbiddenError, NotFoundError } from "./repo";
import type {
  TicketAttachmentCreateInput,
  TicketCreateInput,
  TicketEventCreateInput,
  TicketPatchInput,
} from "./validators";

/* --------------------------------- JSON shape -------------------------------- */

/** Wire shape (the orchestrator's contract) — keep field names stable. */
export function ticketJson(t: Ticket) {
  return {
    id: t.id,
    key: t.key,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    kind: t.kind,
    source: t.source,
    ownerAgent: t.ownerAgent,
    status: t.status,
    priority: t.priority,
    acceptanceCriteria: t.acceptanceCriteria,
    touchedPaths: t.touchedPaths,
    linkedContracts: t.linkedContracts,
    model: t.model,
    effort: t.effort,
    mode: t.mode,
    changelist: t.changelist,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    version: t.version,
    seq: Number(t.seq),
  };
}

export function ticketEventJson(e: TicketEvent, ticketKey: string) {
  return {
    id: Number(e.id),
    ticketId: e.ticketId,
    ticketKey,
    actor: e.actor,
    type: e.type,
    body: e.body,
    data: e.data,
    createdAt: e.createdAt,
  };
}

export function ticketAttachmentJson(a: TicketAttachment) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    actor: a.actor,
    label: a.label,
    url: a.url,
    sha256: a.sha256,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes === null ? null : Number(a.sizeBytes),
    createdAt: a.createdAt,
  };
}

export type TicketJson = ReturnType<typeof ticketJson>;
export type TicketEventJson = ReturnType<typeof ticketEventJson>;
export type TicketAttachmentJson = ReturnType<typeof ticketAttachmentJson>;

/* ---------------------------------- helpers ---------------------------------- */

const now = () => new Date();

/** `VC-12`-style keys; prefix from TICKET_KEY_PREFIX (letters/digits). */
const KEY_RE = /^[A-Za-z][A-Za-z0-9]{0,15}-[1-9][0-9]*$/;

export function ticketKeyPrefix(): string {
  const raw = process.env.TICKET_KEY_PREFIX?.trim();
  if (!raw) return "VC";
  if (/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(raw)) return raw;
  console.warn(`[tickets] ignoring invalid TICKET_KEY_PREFIX "${raw}", using VC`);
  return "VC";
}

/**
 * Arbitrary constant for pg_advisory_xact_lock. Every ticket write runs
 * under it, so `seq` values (and ticket_events ids) commit in the order
 * they were drawn: a poller that has seen seq N can never later find a
 * committed row below N. Writes are rare; serializing them costs nothing.
 */
const TICKET_WRITE_LOCK = 7_265_637_401;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function withTicketLock<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TICKET_WRITE_LOCK}::bigint)`);
    return run(tx);
  });
}

const nextSeq = sql`nextval('ticket_change_seq')`;

async function ticketByKey(tx: Tx | typeof db, key: string): Promise<Ticket> {
  const row = KEY_RE.test(key)
    ? (await tx.select().from(tickets).where(eq(tickets.key, key)).limit(1))[0]
    : undefined;
  if (!row) throw new NotFoundError(`ticket not found: ${key}`);
  return row;
}

/** Events and attachments move the ticket in the poll order (not version). */
async function bumpSeq(tx: Tx, ticketId: number) {
  await tx.update(tickets).set({ seq: nextSeq }).where(eq(tickets.id, ticketId));
}

/* ----------------------------------- reads ----------------------------------- */

export type ListTicketsOpts = {
  sinceSeq?: number;
  status?: TicketStatus;
  owner?: TicketOwner;
  limit?: number;
  updatedSince?: Date;
};

/**
 * Poll feed, ordered by seq. `maxSeq` is the cursor for the next call:
 * the last returned seq when the page is full, otherwise the high-water
 * mark of the whole table (so filtered polls still advance).
 */
export async function listTickets(
  opts: ListTicketsOpts = {},
): Promise<{ tickets: TicketJson[]; maxSeq: number }> {
  const since = opts.sinceSeq ?? 0;
  const limit = opts.limit ?? 200;
  const [{ hw }] = await db
    .select({ hw: sql<string | null>`max(${tickets.seq})` })
    .from(tickets);
  const highWater = hw === null ? 0 : Number(hw);
  const where: SQL[] = [gt(tickets.seq, since), lte(tickets.seq, highWater)];
  if (opts.status) where.push(eq(tickets.status, opts.status));
  if (opts.owner) where.push(eq(tickets.ownerAgent, opts.owner));
  if (opts.updatedSince) where.push(gte(tickets.updatedAt, opts.updatedSince));
  const rows = await db
    .select()
    .from(tickets)
    .where(and(...where))
    .orderBy(asc(tickets.seq))
    .limit(limit);
  const maxSeq =
    rows.length === limit ? Number(rows[rows.length - 1].seq) : Math.max(since, highWater);
  return { tickets: rows.map(ticketJson), maxSeq };
}

/** UI board: every ticket, most urgent first (grouping happens in the page). */
export async function listTicketsForBoard(owner?: TicketOwner): Promise<Ticket[]> {
  return db
    .select()
    .from(tickets)
    .where(owner ? eq(tickets.ownerAgent, owner) : undefined)
    .orderBy(asc(tickets.priority), desc(tickets.updatedAt));
}

export async function getTicket(key: string) {
  const t = await ticketByKey(db, key);
  const [events, attachments] = await Promise.all([
    db
      .select()
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, t.id))
      .orderBy(asc(ticketEvents.id)),
    db
      .select()
      .from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, t.id))
      .orderBy(asc(ticketAttachments.id)),
  ]);
  return {
    ticket: ticketJson(t),
    events: events.map((e) => ticketEventJson(e, t.key)),
    attachments: attachments.map(ticketAttachmentJson),
  };
}

/** For the UI's project link (the wire shape carries projectId only). */
export async function ticketProject(
  projectId: number | null,
): Promise<{ slug: string; name: string } | null> {
  if (projectId === null) return null;
  const [p] = await db
    .select({ slug: projects.slug, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId));
  return p ?? null;
}

export async function listTicketEvents(
  key: string,
  afterId = 0,
): Promise<TicketEventJson[]> {
  const t = await ticketByKey(db, key);
  const rows = await db
    .select()
    .from(ticketEvents)
    .where(and(eq(ticketEvents.ticketId, t.id), gt(ticketEvents.id, afterId)))
    .orderBy(asc(ticketEvents.id));
  return rows.map((e) => ticketEventJson(e, t.key));
}

/** Global event feed across all tickets; `maxId` works like listTickets' maxSeq. */
export async function listTicketEventFeed(
  opts: { afterId?: number; limit?: number } = {},
): Promise<{ events: TicketEventJson[]; maxId: number }> {
  const after = opts.afterId ?? 0;
  const limit = opts.limit ?? 200;
  const [{ hw }] = await db
    .select({ hw: sql<string | null>`max(${ticketEvents.id})` })
    .from(ticketEvents);
  const highWater = hw === null ? 0 : Number(hw);
  const rows = await db
    .select({ event: ticketEvents, key: tickets.key })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .where(and(gt(ticketEvents.id, after), lte(ticketEvents.id, highWater)))
    .orderBy(asc(ticketEvents.id))
    .limit(limit);
  const maxId =
    rows.length === limit ? Number(rows[rows.length - 1].event.id) : Math.max(after, highWater);
  return { events: rows.map((r) => ticketEventJson(r.event, r.key)), maxId };
}

/* ----------------------------------- writes ---------------------------------- */

export async function createTicket(
  actor: Actor,
  input: TicketCreateInput,
): Promise<TicketJson> {
  const status = input.status ?? "triage";
  if (!canSetStatus(actor, status, "create")) {
    throw new ForbiddenError(forbiddenStatusMessage(actor, status));
  }
  let projectId: number | null = null;
  if (input.projectSlug) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, input.projectSlug));
    if (!p) throw new NotFoundError(`project not found: ${input.projectSlug}`);
    projectId = p.id;
  }
  const prefix = ticketKeyPrefix();
  return withTicketLock(async (tx) => {
    const [row] = await tx
      .insert(tickets)
      .values({
        key: sql`${prefix}::text || '-' || nextval('ticket_key_seq')::text`,
        projectId,
        title: input.title,
        description: input.description ?? null,
        kind: input.kind ?? "task",
        source: input.source ?? "manual",
        ownerAgent: input.ownerAgent,
        status,
        priority: input.priority ?? 2,
        acceptanceCriteria: input.acceptanceCriteria ?? null,
        touchedPaths: input.touchedPaths ?? [],
        linkedContracts: input.linkedContracts ?? [],
        model: input.model ?? null,
        effort: input.effort ?? null,
        mode: input.mode ?? null,
        createdBy: actor,
      })
      .returning();
    return ticketJson(row);
  });
}

/**
 * PATCH with optimistic concurrency. Order of checks: agents are refused
 * outright, then a stale `version` is a 409 carrying the current ticket,
 * then the status guard. Re-sending the current status is not a "set" and
 * passes the guard. Every effective update bumps version and seq; a status
 * change also writes status_change {from, to} (plus approval/rejection for
 * approved/changes_requested, with `note` as the body).
 */
export async function updateTicket(
  actor: Actor,
  key: string,
  input: TicketPatchInput,
): Promise<TicketJson> {
  const { version, note, ...fields } = input;
  if (!canPatchTickets(actor)) {
    throw new ForbiddenError(
      fields.status
        ? forbiddenStatusMessage(actor, fields.status)
        : `forbidden: ${actor} may not patch tickets`,
    );
  }
  return withTicketLock(async (tx) => {
    const cur = await ticketByKey(tx, key);
    if (cur.version !== version) {
      throw new ConflictError(
        `version conflict: ${cur.key} is at version ${cur.version}, not ${version}`,
        { ticket: ticketJson(cur) },
      );
    }
    const to = fields.status !== undefined && fields.status !== cur.status ? fields.status : null;
    if (to && !canSetStatus(actor, to, "update")) {
      throw new ForbiddenError(forbiddenStatusMessage(actor, to));
    }
    if (Object.keys(fields).length === 0) return ticketJson(cur);

    const [row] = await tx
      .update(tickets)
      .set({
        ...fields,
        updatedAt: now(),
        version: sql`${tickets.version} + 1`,
        seq: nextSeq,
      })
      .where(and(eq(tickets.id, cur.id), eq(tickets.version, version)))
      .returning();

    if (to) {
      const decision =
        to === "approved" ? "approval" : to === "changes_requested" ? "rejection" : null;
      await tx.insert(ticketEvents).values({
        ticketId: cur.id,
        actor,
        type: "status_change",
        body: decision ? "" : (note ?? ""),
        data: { from: cur.status, to },
      });
      if (decision) {
        await tx.insert(ticketEvents).values({
          ticketId: cur.id,
          actor,
          type: decision,
          body: note ?? "",
        });
      }
    }
    return ticketJson(row);
  });
}

export async function addTicketEvent(
  actor: Actor,
  key: string,
  input: TicketEventCreateInput,
): Promise<TicketEventJson> {
  if (!canAddEvent(actor, input.type)) {
    throw new ForbiddenError(`forbidden: ${actor} may not add ${input.type} events`);
  }
  return withTicketLock(async (tx) => {
    const t = await ticketByKey(tx, key);
    const [row] = await tx
      .insert(ticketEvents)
      .values({
        ticketId: t.id,
        actor,
        type: input.type,
        body: input.body,
        data: input.data ?? {},
      })
      .returning();
    await bumpSeq(tx, t.id);
    return ticketEventJson(row, t.key);
  });
}

export async function addTicketAttachment(
  actor: Actor,
  key: string,
  input: TicketAttachmentCreateInput,
): Promise<TicketAttachmentJson> {
  return withTicketLock(async (tx) => {
    const t = await ticketByKey(tx, key);
    const [row] = await tx
      .insert(ticketAttachments)
      .values({
        ticketId: t.id,
        actor,
        label: input.label,
        url: input.url,
        sha256: input.sha256,
        contentType: input.contentType ?? null,
        sizeBytes: input.sizeBytes ?? null,
      })
      .returning();
    await bumpSeq(tx, t.id);
    return ticketAttachmentJson(row);
  });
}
