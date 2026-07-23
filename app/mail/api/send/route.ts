import { NextRequest } from "next/server";
import { z } from "zod";
import { handleError, json } from "@/lib/api";
import { getAccount, sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Send mail through Proton Mail Bridge. Deliberately OUTSIDE /api — in
 * production Cloudflare Access (owner PIN) guards it like every UI page;
 * the custom header forces a CORS preflight against cross-origin abuse.
 */
const sendSchema = z.object({
  account: z.string().trim().max(60).optional(),
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
    const input = sendSchema.parse(await req.json());
    const acc = getAccount(input.account);
    if (!acc) return json({ error: "no mail accounts configured" }, 503);
    await sendMail(acc, input);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
