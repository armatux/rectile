import { NextRequest } from "next/server";
import { z } from "zod";
import { handleError, json } from "@/lib/api";
import { deletePushSubscription, savePushSubscription } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Web Push subscription registry. Deliberately OUTSIDE /api: Cloudflare
 * Access guards it like every UI page (only /api/* bypasses Access). The
 * custom X-Rectile-Push header forces a CORS preflight, so cross-origin
 * pages cannot invoke it.
 */

const subSchema = z.object({
  endpoint: z.string().url().max(2_000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

function guarded(req: NextRequest): boolean {
  return req.headers.get("x-rectile-push") === "1";
}

export async function POST(req: NextRequest) {
  try {
    if (!guarded(req)) return json({ error: "missing push header" }, 400);
    const sub = subSchema.parse(await req.json());
    await savePushSubscription({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return json({ ok: true }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!guarded(req)) return json({ error: "missing push header" }, 400);
    const { endpoint } = z
      .object({ endpoint: z.string().url().max(2_000) })
      .parse(await req.json());
    await deletePushSubscription(endpoint);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
