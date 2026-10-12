import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ACTORS, type Actor } from "@/db/schema";

/**
 * Who is calling /api/*: pure helpers shared by middleware.ts (which
 * resolves the bearer token) and the route handlers (which read the result).
 * No DB access here — the token lookup is injected.
 */

export type ActorIdentity = { actor: Actor; tokenName: string };

/** Name reported by whoami for the legacy env token. */
export const ENV_TOKEN_NAME = "API_TOKEN";

/** `rt_` + 40 url-safe chars (30 random bytes, base64url). */
const ACTOR_TOKEN_RE = /^rt_[A-Za-z0-9_-]{40}$/;

export function isActor(value: unknown): value is Actor {
  return typeof value === "string" && (ACTORS as readonly string[]).includes(value);
}

export function generateRawToken(): string {
  return `rt_${randomBytes(30).toString("base64url")}`;
}

export function isActorTokenShape(token: string): boolean {
  return ACTOR_TOKEN_RE.test(token);
}

/** SHA-256 hex — the only form in which actor tokens are stored. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Constant-time comparison via fixed-length digests (length-independent). */
export function secretsMatch(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}

export type TokenLookup = (
  tokenHash: string,
) => Promise<{ actor: Actor; name: string } | null>;

/**
 * Bearer token → identity. The env API_TOKEN is the owner (`human`); an
 * `rt_` token is looked up by its hash (revoked tokens resolve to null).
 * Anything else is rejected without touching the database.
 */
export async function resolveBearer(
  presented: string,
  apiToken: string,
  lookup: TokenLookup,
): Promise<ActorIdentity | null> {
  if (secretsMatch(presented, apiToken)) {
    return { actor: "human", tokenName: ENV_TOKEN_NAME };
  }
  if (!isActorTokenShape(presented)) return null;
  const row = await lookup(hashToken(presented));
  return row ? { actor: row.actor, tokenName: row.name } : null;
}

/* ----------------------------- request headers ---------------------------- */

/**
 * The middleware hands the resolved identity to route handlers as request
 * headers. Client-supplied copies are always overwritten, and the HMAC
 * (keyed with API_TOKEN) means a request that somehow skipped the
 * middleware cannot forge them either.
 */
export const ACTOR_HEADER = "x-rectile-actor";
export const TOKEN_NAME_HEADER = "x-rectile-token-name";
export const ACTOR_SIG_HEADER = "x-rectile-actor-sig";

function sign(actor: string, encodedName: string, key: string): string {
  return createHmac("sha256", key)
    .update(`rectile-actor:v1\n${actor}\n${encodedName}`)
    .digest("hex");
}

export function stampActorHeaders(
  headers: Headers,
  identity: ActorIdentity,
  key: string,
): void {
  const encodedName = encodeURIComponent(identity.tokenName);
  headers.set(ACTOR_HEADER, identity.actor);
  headers.set(TOKEN_NAME_HEADER, encodedName);
  headers.set(ACTOR_SIG_HEADER, sign(identity.actor, encodedName, key));
}

export function readActorHeaders(
  headers: Headers,
  key: string,
): ActorIdentity | null {
  const actor = headers.get(ACTOR_HEADER);
  const encodedName = headers.get(TOKEN_NAME_HEADER) ?? "";
  const sig = headers.get(ACTOR_SIG_HEADER) ?? "";
  if (!isActor(actor) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = Buffer.from(sign(actor, encodedName, key), "hex");
  if (!timingSafeEqual(expected, Buffer.from(sig, "hex"))) return null;
  try {
    return { actor, tokenName: decodeURIComponent(encodedName) };
  } catch {
    return null;
  }
}

/* ------------------------------ legacy routes ------------------------------ */

/** Endpoints that apply their own per-actor rules (ticket guard, human-only). */
const ACTOR_AWARE_PATH = /^\/api\/(mcp|v1\/(tickets|ticket-events|tokens|whoami))(\/|$)/;
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Agent tokens (`code`, `visual`) may read everything but write only
 * through the ticket endpoints — never the projects/logs/kv routes, whose
 * markdown renders unsanitized in the owner's browser.
 */
export function actorMayRequest(actor: Actor, method: string, pathname: string): boolean {
  if (actor === "human" || actor === "orchestrator") return true;
  return READ_METHODS.has(method.toUpperCase()) || ACTOR_AWARE_PATH.test(pathname);
}
