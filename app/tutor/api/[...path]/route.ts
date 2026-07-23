import { NextRequest, NextResponse } from "next/server";
import { bridge } from "@/lib/tutorBridge";

/**
 * Proxy to the laptop's cpptutor bridge. Deliberately OUTSIDE /api so
 * Cloudflare Access (owner-only) guards it — the public bearer token must
 * never be enough to reach code execution. Mutations additionally require
 * the x-cpptutor header so cross-origin requests die in preflight.
 */
export const dynamic = "force-dynamic";

const ALLOWED = /^(health$|tree$|lesson\/|quiz\/|exercise\/)/;

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const p = path.join("/");
  if (!ALLOWED.test(p)) {
    return NextResponse.json({ error: "no such endpoint" }, { status: 404 });
  }
  if (req.method !== "GET" && req.headers.get("x-cpptutor") !== "1") {
    return NextResponse.json({ error: "missing app header" }, { status: 403 });
  }
  let body: unknown;
  if (req.method !== "GET") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }
  try {
    const r = await bridge(req.method, `/${p}`, body);
    return NextResponse.json(r.data, { status: r.status });
  } catch {
    return NextResponse.json(
      { error: "LAPTOP LINK DOWN — the tutor bridge is unreachable" },
      { status: 502 },
    );
  }
}

export { handle as GET, handle as POST, handle as PUT };
