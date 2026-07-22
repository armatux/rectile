export const dynamic = "force-dynamic";

/** Container healthcheck. Deliberately NOT under /api (which is token-gated). */
export async function GET() {
  return Response.json({ ok: true });
}
