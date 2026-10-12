import { NextRequest } from "next/server";
import { handleError, json, requireActor } from "@/lib/api";
import { addTicketAttachment } from "@/lib/tickets";
import { ticketAttachmentCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { actor } = requireActor(req);
    const { key } = await params;
    const input = ticketAttachmentCreateSchema.parse(await req.json());
    return json({ attachment: await addTicketAttachment(actor, key, input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
