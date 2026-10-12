import { NextRequest } from "next/server";
import { handleError, json, requireActor } from "@/lib/api";
import { addTicketEvent, listTicketEvents } from "@/lib/tickets";
import { ticketEventCreateSchema, ticketEventsQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    requireActor(req);
    const { key } = await params;
    const q = ticketEventsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    return json({ events: await listTicketEvents(key, q.after_id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { actor } = requireActor(req);
    const { key } = await params;
    const input = ticketEventCreateSchema.parse(await req.json());
    return json({ event: await addTicketEvent(actor, key, input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
