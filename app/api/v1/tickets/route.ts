import { NextRequest } from "next/server";
import { handleError, json, requireActor } from "@/lib/api";
import { createTicket, listTickets } from "@/lib/tickets";
import { ticketCreateSchema, ticketListQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireActor(req);
    const q = ticketListQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    return json(
      await listTickets({
        sinceSeq: q.since_seq,
        status: q.status,
        owner: q.owner,
        limit: q.limit,
        updatedSince: q.updated_since,
      }),
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { actor } = requireActor(req);
    const input = ticketCreateSchema.parse(await req.json());
    return json({ ticket: await createTicket(actor, input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
