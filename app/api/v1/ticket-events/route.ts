import { NextRequest } from "next/server";
import { handleError, json, requireActor } from "@/lib/api";
import { listTicketEventFeed } from "@/lib/tickets";
import { ticketEventFeedQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** Global event feed across all tickets, ordered by id. */
export async function GET(req: NextRequest) {
  try {
    requireActor(req);
    const q = ticketEventFeedQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    return json(await listTicketEventFeed({ afterId: q.after_id, limit: q.limit }));
  } catch (err) {
    return handleError(err);
  }
}
