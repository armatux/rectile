import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { addEvent, listEvents } from "@/lib/repo";
import { eventCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(Date.now() - 30 * 86_400_000);
    const to = sp.get("to") ? new Date(sp.get("to")!) : new Date(Date.now() + 90 * 86_400_000);
    return json({ events: await listEvents(from, to) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = eventCreateSchema.parse(await req.json());
    return json({ event: await addEvent(input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
