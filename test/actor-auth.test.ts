import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actorMayRequest,
  generateRawToken,
  hashToken,
  isActorTokenShape,
  readActorHeaders,
  resolveBearer,
  stampActorHeaders,
  type TokenLookup,
} from "@/lib/actor";

/* The DB lookup is mocked here; test/tickets-route.test.ts exercises the
   real api_tokens table. */
const findActiveToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tokens", () => ({ findActiveToken }));

import { middleware } from "../middleware";

const API_TOKEN = "test-token-1234567890";
const CODE_TOKEN = `rt_${"a".repeat(40)}`;

describe("token hashing", () => {
  it("generates rt_ + 40 url-safe chars, unique per call", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateRawToken));
    expect(tokens.size).toBe(50);
    for (const t of tokens) {
      expect(t).toMatch(/^rt_[A-Za-z0-9_-]{40}$/);
      expect(isActorTokenShape(t)).toBe(true);
    }
  });

  it("stores SHA-256 hex (known vector)", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const raw = generateRawToken();
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).not.toContain(raw.slice(3));
  });

  it("rejects malformed actor tokens by shape", () => {
    for (const bad of ["rt_short", `rt_${"a".repeat(41)}`, `xx_${"a".repeat(40)}`, `rt_${"a".repeat(39)}!`]) {
      expect(isActorTokenShape(bad), bad).toBe(false);
    }
  });
});

describe("actor resolution", () => {
  const lookup = vi.fn<TokenLookup>();
  beforeEach(() => lookup.mockReset());

  it("maps the env API_TOKEN to human without a lookup", async () => {
    expect(await resolveBearer(API_TOKEN, API_TOKEN, lookup)).toEqual({
      actor: "human",
      tokenName: "API_TOKEN",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("looks rt_ tokens up by hash, never by raw value", async () => {
    lookup.mockResolvedValue({ actor: "code", name: "code-agent" });
    expect(await resolveBearer(CODE_TOKEN, API_TOKEN, lookup)).toEqual({
      actor: "code",
      tokenName: "code-agent",
    });
    expect(lookup).toHaveBeenCalledWith(hashToken(CODE_TOKEN));
  });

  it("returns null for unknown/revoked tokens and skips the DB for junk", async () => {
    lookup.mockResolvedValue(null);
    expect(await resolveBearer(CODE_TOKEN, API_TOKEN, lookup)).toBeNull();
    lookup.mockClear();
    expect(await resolveBearer("wrong-token", API_TOKEN, lookup)).toBeNull();
    expect(await resolveBearer(API_TOKEN.slice(0, -1), API_TOKEN, lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("signed actor headers round-trip and resist tampering", () => {
    const h = new Headers();
    stampActorHeaders(h, { actor: "visual", tokenName: "ué agent" }, API_TOKEN);
    expect(readActorHeaders(h, API_TOKEN)).toEqual({ actor: "visual", tokenName: "ué agent" });
    expect(readActorHeaders(h, "another-key")).toBeNull();
    h.set("x-rectile-actor", "human");
    expect(readActorHeaders(h, API_TOKEN)).toBeNull();
    const bare = new Headers({ "x-rectile-actor": "human" });
    expect(readActorHeaders(bare, API_TOKEN)).toBeNull();
  });

  it("agents may write only through the ticket endpoints", () => {
    expect(actorMayRequest("code", "GET", "/api/v1/projects")).toBe(true);
    expect(actorMayRequest("code", "POST", "/api/v1/projects/x/logs")).toBe(false);
    expect(actorMayRequest("visual", "PUT", "/api/v1/kv/cpptutor")).toBe(false);
    expect(actorMayRequest("code", "POST", "/api/v1/tickets")).toBe(true);
    expect(actorMayRequest("code", "POST", "/api/v1/tickets/VC-1/events")).toBe(true);
    expect(actorMayRequest("code", "POST", "/api/mcp")).toBe(true);
    expect(actorMayRequest("code", "POST", "/api/v1/ticketsx")).toBe(false);
    expect(actorMayRequest("orchestrator", "DELETE", "/api/v1/projects/x")).toBe(true);
  });
});

describe("middleware with actor tokens", () => {
  const original = process.env.API_TOKEN;
  beforeEach(() => {
    process.env.API_TOKEN = API_TOKEN;
    findActiveToken.mockReset();
  });
  afterEach(() => {
    process.env.API_TOKEN = original;
  });

  function req(path: string, headers: Record<string, string>, method = "GET") {
    return new NextRequest(`http://localhost${path}`, { method, headers });
  }

  /** what the route handler will see for a header the middleware overrode */
  function forwarded(res: Response, name: string) {
    return res.headers.get(`x-middleware-request-${name}`);
  }

  it("resolves an rt_ token and overwrites a client-supplied actor", async () => {
    findActiveToken.mockResolvedValue({ actor: "code", name: "code-agent" });
    const res = await middleware(
      req("/api/v1/tickets", {
        authorization: `Bearer ${CODE_TOKEN}`,
        "x-rectile-actor": "human",
        "x-rectile-actor-sig": "0".repeat(64),
      }),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(forwarded(res, "x-rectile-actor")).toBe("code");
    expect(forwarded(res, "x-rectile-token-name")).toBe("code-agent");
    expect(forwarded(res, "x-rectile-actor-sig")).not.toBe("0".repeat(64));
    expect(findActiveToken).toHaveBeenCalledWith(hashToken(CODE_TOKEN));
  });

  it("stamps API_TOKEN requests as human even if the client claims otherwise", async () => {
    const res = await middleware(
      req("/api/v1/projects", {
        authorization: `Bearer ${API_TOKEN}`,
        "x-rectile-actor": "code",
      }),
    );
    expect(forwarded(res, "x-rectile-actor")).toBe("human");
    expect(findActiveToken).not.toHaveBeenCalled();
  });

  it("rejects a revoked/unknown rt_ token with 401", async () => {
    findActiveToken.mockResolvedValue(null);
    const res = await middleware(req("/api/v1/tickets", { authorization: `Bearer ${CODE_TOKEN}` }));
    expect(res.status).toBe(401);
  });

  it("refuses agent writes to legacy routes with 403", async () => {
    findActiveToken.mockResolvedValue({ actor: "visual", name: "visual-agent" });
    const res = await middleware(
      req("/api/v1/projects/x/logs", { authorization: `Bearer ${CODE_TOKEN}` }, "POST"),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden: visual may not POST /api/v1/projects/x/logs");
  });

  it("answers 503 (not 401) when the token store is down, without leaking the token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    findActiveToken.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await middleware(req("/api/v1/tickets", { authorization: `Bearer ${CODE_TOKEN}` }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE_TOKEN);
    spy.mockRestore();
  });
});
