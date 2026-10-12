import { NextRequest } from "next/server";
import { handleError, json, requireActor } from "@/lib/api";
import { getTicket, updateTicket } from "@/lib/tickets";
import { ticketPatchSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    requireActor(req);
    const { key } = await params;
    return json(await getTicket(key));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { actor } = requireActor(req);
    const { key } = await params;
    const input = ticketPatchSchema.parse(await req.json());
    return json({ ticket: await updateTicket(actor, key, input) });
  } catch (err) {
    return handleError(err);
  }
}
