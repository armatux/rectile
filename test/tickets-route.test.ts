/**
 * Ticket API route handlers, called through the real middleware (bearer
 * check + signed actor headers) against a real Postgres (set DATABASE_URL;
 * the suite is skipped without it).
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

const API_TOKEN = "vitest-api-token-0123456789";

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: Ctx<P>) => Promise<Response>;
type Ticket = { key: string; seq: number; version: number; [k: string]: unknown };

describe.skipIf(!hasDb)("tickets API", () => {
  const originalToken = process.env.API_TOKEN;
  const bearer: Record<string, string> = {};
  const tokenIds: number[] = [];
  const keys: string[] = [];

  beforeAll(async () => {
    process.env.API_TOKEN = API_TOKEN;
    bearer.human = API_TOKEN;
    const { issueToken } = await import("@/lib/tokens");
    for (const actor of ["orchestrator", "code"] as const) {
      const { token, rawToken } = await issueToken(actor, `vitest-${actor}`);
      bearer[actor] = rawToken;
      tokenIds.push(token.id);
    }
  });

  afterAll(async () => {
    const { db, client } = await import("@/db");
    const { apiTokens, tickets } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    if (keys.length) await db.delete(tickets).where(inArray(tickets.key, keys));
    if (tokenIds.length) await db.delete(apiTokens).where(inArray(apiTokens.id, tokenIds));
    process.env.API_TOKEN = originalToken;
    await client.end();
  });

  /** Runs the gate like Next would, then the handler with the headers it forwarded. */
  async function call<P>(
    handler: Handler<P>,
    opts: { as: string; path: string; method?: string; body?: unknown; params?: P },
  ): Promise<Response> {
    const { middleware } = await import("../middleware");
    const url = `http://localhost${opts.path}`;
    const method = opts.method ?? "GET";
    const headers = new Headers({
      authorization: `Bearer ${bearer[opts.as] ?? opts.as}`,
      "content-type": "application/json",
    });
    const gate = await middleware(new NextRequest(url, { method, headers }));
    if (gate.headers.get("x-middleware-next") !== "1") return gate;
    const forwarded = new Headers();
    const names = gate.headers.get("x-middleware-override-headers") ?? "";
    for (const name of names.split(",").filter(Boolean)) {
      forwarded.set(name, gate.headers.get(`x-middleware-request-${name}`) ?? "");
    }
    const req = new NextRequest(url, {
      method,
      headers: forwarded,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return handler(req, { params: Promise.resolve(opts.params as P) });
  }

  const routes = async () => ({
    list: await import("@/app/api/v1/tickets/route"),
    single: await import("@/app/api/v1/tickets/[key]/route"),
    events: await import("@/app/api/v1/tickets/[key]/events/route"),
    attachments: await import("@/app/api/v1/tickets/[key]/attachments/route"),
    feed: await import("@/app/api/v1/ticket-events/route"),
  });

  async function create(as: string, body: Record<string, unknown>): Promise<Ticket> {
    const { list } = await routes();
    const res = await call(list.POST, { as, path: "/api/v1/tickets", method: "POST", body });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    const { ticket } = await res.json();
    keys.push(ticket.key);
    return ticket;
  }

  async function patch(as: string, key: string, body: Record<string, unknown>) {
    const { single } = await routes();
    return call(single.PATCH, {
      as,
      path: `/api/v1/tickets/${key}`,
      method: "PATCH",
      body,
      params: { key },
    });
  }

  async function fetchTicket(key: string) {
    const { single } = await routes();
    const res = await call(single.GET, { as: "code", path: `/api/v1/tickets/${key}`, params: { key } });
    expect(res.status).toBe(200);
    return res.json();
  }

  async function highWater(): Promise<number> {
    const { db } = await import("@/db");
    const { tickets } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    const [{ m }] = await db
      .select({ m: sql<string>`coalesce(max(${tickets.seq}), 0)` })
      .from(tickets);
    return Number(m);
  }

  it("creates tickets and applies the create guard", async () => {
    const t = await create("orchestrator", {
      title: "Ghost pathing on stairs",
      ownerAgent: "code",
      status: "queued",
      priority: 1,
      touchedPaths: ["Source/tha_game/Ghost/**", "Content/Maps/Demo.umap"],
      linkedContracts: ["ghost-api@1.2.0"],
    });
    expect(t.key).toMatch(/^VC-[1-9][0-9]*$/);
    expect(t).toMatchObject({
      status: "queued",
      createdBy: "orchestrator",
      ownerAgent: "code",
      kind: "task",
      source: "manual",
      version: 1,
      projectId: null,
      touchedPaths: ["Source/tha_game/Ghost/**", "Content/Maps/Demo.umap"],
      linkedContracts: ["ghost-api@1.2.0"],
    });
    expect(typeof t.seq).toBe("number");
    expect(Object.keys(t)).toEqual([
      "id", "key", "projectId", "title", "description", "kind", "source",
      "ownerAgent", "status", "priority", "acceptanceCriteria", "touchedPaths",
      "linkedContracts", "model", "effort", "mode", "changelist", "createdBy",
      "createdAt", "updatedAt", "version", "seq",
    ]);

    // stored as real jsonb arrays, not JSON strings
    const { client } = await import("@/db");
    const [row] = await client`select jsonb_typeof(touched_paths) as t from tickets where key = ${t.key}`;
    expect(row.t).toBe("array");

    const { list } = await routes();
    const denied = await call(list.POST, {
      as: "code",
      path: "/api/v1/tickets",
      method: "POST",
      body: { title: "skip triage", ownerAgent: "code", status: "queued" },
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("forbidden: code may not set status queued");

    const agentTicket = await create("code", { title: "found a bug", ownerAgent: "human" });
    expect(agentTicket).toMatchObject({ status: "triage", createdBy: "code" });

    const invalid = await call(list.POST, {
      as: "orchestrator",
      path: "/api/v1/tickets",
      method: "POST",
      body: { title: "no owner" },
    });
    expect(invalid.status).toBe(400);

    const detail = await fetchTicket(t.key);
    expect(detail).toMatchObject({ ticket: { key: t.key }, events: [], attachments: [] });
  });

  it("polls by since_seq in seq order with a usable maxSeq cursor", async () => {
    const { list } = await routes();
    const cursor = await highWater();
    const a = await create("orchestrator", { title: "poll A", ownerAgent: "code" });
    const b = await create("orchestrator", { title: "poll B", ownerAgent: "visual" });
    const patched = await patch("orchestrator", a.key, { version: 1, priority: 3 });
    expect(patched.status).toBe(200);
    const { ticket: a2 } = await patched.json();
    expect(a2.seq).toBeGreaterThan(b.seq);

    const poll = async (qs: string) => {
      const res = await call(list.GET, { as: "orchestrator", path: `/api/v1/tickets?${qs}` });
      expect(res.status).toBe(200);
      return (await res.json()) as { tickets: Ticket[]; maxSeq: number };
    };

    const all = await poll(`since_seq=${cursor}`);
    expect(all.tickets.map((t) => t.key)).toEqual([b.key, a.key]);
    expect(all.maxSeq).toBe(a2.seq);

    const none = await poll(`since_seq=${all.maxSeq}`);
    expect(none.tickets).toEqual([]);
    expect(none.maxSeq).toBe(all.maxSeq);

    // a full page hands back its own last seq, so the next page starts there
    const page = await poll(`since_seq=${cursor}&limit=1`);
    expect(page.tickets.map((t) => t.key)).toEqual([b.key]);
    expect(page.maxSeq).toBe(b.seq);

    // a filtered poll still advances to the table's high-water mark
    const visual = await poll(`since_seq=${cursor}&owner=visual`);
    expect(visual.tickets.map((t) => t.key)).toEqual([b.key]);
    expect(visual.maxSeq).toBe(a2.seq);

    const bad = await call(list.GET, { as: "orchestrator", path: "/api/v1/tickets?limit=501" });
    expect(bad.status).toBe(400);
  });

  it("rejects a stale version with 409 and the current ticket", async () => {
    const t = await create("orchestrator", { title: "conflict probe", ownerAgent: "code" });
    expect((await patch("orchestrator", t.key, { version: 1, title: "first" })).status).toBe(200);

    const stale = await patch("orchestrator", t.key, { version: 1, title: "second" });
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error).toMatch(/version conflict/);
    expect(body.ticket).toMatchObject({ key: t.key, version: 2, title: "first" });

    const missing = await patch("orchestrator", t.key, { title: "no version" });
    expect(missing.status).toBe(400);
  });

  it("forbids agents and the orchestrator from approving; the owner may", async () => {
    const t = await create("orchestrator", { title: "review probe", ownerAgent: "code" });

    const agent = await patch("code", t.key, { version: 1, status: "approved" });
    expect(agent.status).toBe(403);
    expect((await agent.json()).error).toBe("forbidden: code may not set status approved");

    const agentEdit = await patch("code", t.key, { version: 1, title: "sneaky" });
    expect(agentEdit.status).toBe(403);
    expect((await agentEdit.json()).error).toBe("forbidden: code may not patch tickets");

    const orch = await patch("orchestrator", t.key, { version: 1, status: "approved" });
    expect(orch.status).toBe(403);
    expect((await orch.json()).error).toBe("forbidden: orchestrator may not set status approved");

    const review = await patch("orchestrator", t.key, { version: 1, status: "ready_for_review" });
    expect(review.status).toBe(200);

    const approve = await patch("human", t.key, { version: 2, status: "approved", note: "ship it" });
    expect(approve.status).toBe(200);
    expect((await approve.json()).ticket).toMatchObject({ status: "approved", version: 3 });

    const { events } = await fetchTicket(t.key);
    expect(
      events.map((e: { actor: string; type: string; body: string; data: unknown }) => [
        e.actor,
        e.type,
        e.body,
        e.data,
      ]),
    ).toEqual([
      ["orchestrator", "status_change", "", { from: "triage", to: "ready_for_review" }],
      ["human", "status_change", "", { from: "ready_for_review", to: "approved" }],
      ["human", "approval", "ship it", {}],
    ]);
  });

  it("adding events and attachments bumps seq but not version", async () => {
    const { events, attachments, feed } = await routes();
    const t = await create("orchestrator", { title: "event probe", ownerAgent: "visual" });
    const params = { key: t.key };
    const path = `/api/v1/tickets/${t.key}`;

    const asked = await call(events.POST, {
      as: "code",
      path: `${path}/events`,
      method: "POST",
      body: { type: "question", body: "which map?" },
      params,
    });
    expect(asked.status).toBe(201);
    const { event } = await asked.json();
    expect(event).toMatchObject({ ticketKey: t.key, actor: "code", type: "question", data: {} });

    const afterEvent = (await fetchTicket(t.key)).ticket;
    expect(afterEvent.seq).toBeGreaterThan(t.seq);
    expect(afterEvent.version).toBe(t.version);

    for (const [as, type] of [["code", "approval"], ["orchestrator", "rejection"]]) {
      const res = await call(events.POST, {
        as,
        path: `${path}/events`,
        method: "POST",
        body: { type, body: "" },
        params,
      });
      expect(res.status, `${as} ${type}`).toBe(403);
    }

    const gate = await call(events.POST, {
      as: "orchestrator",
      path: `${path}/events`,
      method: "POST",
      body: { type: "gate_result", body: "", data: { passed: true } },
      params,
    });
    expect(gate.status).toBe(201);

    const attached = await call(attachments.POST, {
      as: "code",
      path: `${path}/attachments`,
      method: "POST",
      body: {
        label: "after.png",
        url: "https://example.com/after.png",
        sha256: "AB".repeat(32),
        contentType: "image/png",
        sizeBytes: 1234,
      },
      params,
    });
    expect(attached.status).toBe(201);
    expect((await attached.json()).attachment).toMatchObject({
      actor: "code",
      sha256: "ab".repeat(32),
      sizeBytes: 1234,
    });
    const afterAttach = (await fetchTicket(t.key)).ticket;
    expect(afterAttach.seq).toBeGreaterThan(afterEvent.seq);
    expect(afterAttach.version).toBe(t.version);

    const unsafe = await call(attachments.POST, {
      as: "code",
      path: `${path}/attachments`,
      method: "POST",
      body: { label: "x", url: "javascript:alert(1)", sha256: "ab".repeat(32) },
      params,
    });
    expect(unsafe.status).toBe(400);

    const later = await call(events.GET, {
      as: "code",
      path: `${path}/events?after_id=${event.id}`,
      params,
    });
    expect((await later.json()).events.map((e: { type: string }) => e.type)).toEqual(["gate_result"]);

    const global = await call(feed.GET, {
      as: "orchestrator",
      path: `/api/v1/ticket-events?after_id=${event.id - 1}&limit=1`,
    });
    const page = await global.json();
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({ id: event.id, ticketKey: t.key });
    expect(page.maxId).toBe(event.id);
  });

  it("whoami, human-only token admin, and read-only agents on legacy routes", async () => {
    const whoami = await import("@/app/api/v1/whoami/route");
    const tokensRoute = await import("@/app/api/v1/tokens/route");
    const tokenRoute = await import("@/app/api/v1/tokens/[id]/route");
    const projects = await import("@/app/api/v1/projects/route");

    const who = async (as: string) => {
      const res = await call(whoami.GET, { as, path: "/api/v1/whoami" });
      return { status: res.status, body: await res.json() };
    };
    expect((await who("code")).body).toEqual({ actor: "code", tokenName: "vitest-code" });
    expect((await who("human")).body).toEqual({ actor: "human", tokenName: "API_TOKEN" });

    const forbidden = await call(tokensRoute.GET, { as: "orchestrator", path: "/api/v1/tokens" });
    expect(forbidden.status).toBe(403);

    const issued = await call(tokensRoute.POST, {
      as: "human",
      path: "/api/v1/tokens",
      method: "POST",
      body: { actor: "visual", name: "vitest-visual" },
    });
    expect(issued.status).toBe(201);
    const { token, rawToken } = await issued.json();
    tokenIds.push(token.id);
    expect(rawToken).toMatch(/^rt_[A-Za-z0-9_-]{40}$/);
    expect((await who(rawToken)).body).toEqual({ actor: "visual", tokenName: "vitest-visual" });

    const listed = await call(tokensRoute.GET, { as: "human", path: "/api/v1/tokens" });
    const text = await listed.text();
    expect(text).toContain("vitest-visual");
    expect(text).not.toMatch(/hash/i);
    const mine = JSON.parse(text).tokens.find((x: { id: number }) => x.id === token.id);
    expect(mine.lastUsedAt).not.toBeNull(); // stamped by the whoami call above

    const revoked = await call(tokenRoute.DELETE, {
      as: "human",
      path: `/api/v1/tokens/${token.id}`,
      method: "DELETE",
      params: { id: String(token.id) },
    });
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).token.revokedAt).not.toBeNull();
    expect((await who(rawToken)).status).toBe(401);

    const read = await call(projects.GET, { as: "code", path: "/api/v1/projects" });
    expect(read.status).toBe(200);
    const write = await call(projects.POST, {
      as: "code",
      path: "/api/v1/projects",
      method: "POST",
      body: { name: "agent should not create this" },
    });
    expect(write.status).toBe(403);
  });
});
