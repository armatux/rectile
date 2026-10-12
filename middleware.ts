import { NextRequest, NextResponse } from "next/server";
import {
  actorMayRequest,
  resolveBearer,
  stampActorHeaders,
  type ActorIdentity,
} from "@/lib/actor";

/**
 * Bearer-token gate for EVERYTHING under /api/*, including /api/mcp.
 *
 * The browser UI is protected by Cloudflare Access in front of the tunnel;
 * this middleware is the only guard on the API paths, which are excluded
 * from Access so Claude can reach them. Never mount a route under /api
 * that should skip this check.
 *
 * Accepts the env API_TOKEN (actor `human`) or an unrevoked per-actor
 * `rt_` token from the api_tokens table, and hands the resolved actor to
 * the route handlers as signed request headers (see lib/actor.ts). Runs on
 * the Node.js runtime (stable since Next 15.5) so it can reach Postgres.
 */
export const config = { matcher: "/api/:path*", runtime: "nodejs" };

async function lookupToken(tokenHash: string) {
  const { findActiveToken } = await import("@/lib/tokens");
  return findActiveToken(tokenHash);
}

export async function middleware(req: NextRequest) {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "server misconfigured: API_TOKEN is not set" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  let identity: ActorIdentity | null = null;
  if (match) {
    try {
      identity = await resolveBearer(match[1].trim(), expected, lookupToken);
    } catch (err) {
      // never log the presented token — only why the lookup failed
      console.error("[auth] token lookup failed:", err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: "token store unavailable" },
        { status: 503 },
      );
    }
  }
  if (!identity) {
    return NextResponse.json(
      { error: "unauthorized: missing or invalid bearer token" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  const { pathname } = req.nextUrl;
  if (!actorMayRequest(identity.actor, req.method, pathname)) {
    return NextResponse.json(
      { error: `forbidden: ${identity.actor} may not ${req.method} ${pathname}` },
      { status: 403 },
    );
  }
  const headers = new Headers(req.headers);
  stampActorHeaders(headers, identity, expected);
  return NextResponse.next({ request: { headers } });
}
