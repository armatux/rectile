import { NextRequest, NextResponse } from "next/server";

/**
 * Bearer-token gate for EVERYTHING under /api/*, including /api/mcp.
 *
 * The browser UI is protected by Cloudflare Access in front of the tunnel;
 * this middleware is the only guard on the API paths, which are excluded
 * from Access so Claude can reach them. Never mount a route under /api
 * that should skip this check.
 */
export const config = { matcher: "/api/:path*" };

async function sha256(data: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return new Uint8Array(buf);
}

/** Constant-time comparison via fixed-length digests (edge-runtime safe). */
async function tokensMatch(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
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
  if (!match || !(await tokensMatch(match[1].trim(), expected))) {
    return NextResponse.json(
      { error: "unauthorized: missing or invalid bearer token" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  return NextResponse.next();
}
