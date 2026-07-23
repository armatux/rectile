import { NextRequest } from "next/server";
import { z } from "zod";
import { handleError, json } from "@/lib/api";
import { mailConfig, sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Send mail through Proton Mail Bridge. Deliberately OUTSIDE /api — in
 * production Cloudflare Access (owner PIN) guards it like every UI page;
 * the custom header forces a CORS preflight against cross-origin abuse.
 */
const sendSchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(100_000),
  inReplyTo: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("x-rectile-mail") !== "1") {
      return json({ error: "missing mail header" }, 400);
    }
    const cfg = mailConfig();
    if (!cfg) return json({ error: "Proton Mail Bridge is not configured" }, 503);
    const input = sendSchema.parse(await req.json());
    await sendMail(cfg, input);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
