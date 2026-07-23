import { NextRequest } from "next/server";
import { handleError, json, parseId } from "@/lib/api";
import { deleteEvent } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await deleteEvent(parseId((await params).id));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
