import { NextRequest } from "next/server";
import { z } from "zod";
import { handleError, json } from "@/lib/api";
import { updateReminder } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Snooze target for notification action buttons (sw.js). Outside /api so
 * Cloudflare Access guards it; the SW fetch carries the Access cookie.
 * The device computes the new deadline locally and sends it as ISO.
 */
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("x-rectile-push") !== "1") {
      return json({ error: "missing push header" }, 400);
    }
    const { id, until } = z
      .object({ id: z.number().int().positive(), until: z.coerce.date() })
      .parse(await req.json());
    // dueAt change re-arms notifiedAt in updateReminder — it will fire again
    return json({ reminder: await updateReminder(id, { dueAt: until }) });
  } catch (err) {
    return handleError(err);
  }
}
