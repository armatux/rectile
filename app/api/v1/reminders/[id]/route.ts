import { NextRequest } from "next/server";
import { handleError, json, parseId } from "@/lib/api";
import { deleteReminder, updateReminder } from "@/lib/repo";
import { reminderUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const id = parseId((await params).id);
    const patch = reminderUpdateSchema.parse(await req.json());
    return json({ reminder: await updateReminder(id, patch) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await deleteReminder(parseId((await params).id));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
