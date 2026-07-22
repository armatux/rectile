import { NextRequest } from "next/server";
import { handleError, json, parseId } from "@/lib/api";
import { deleteLink, updateLink } from "@/lib/repo";
import { linkUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const input = linkUpdateSchema.parse(await req.json());
    return json({ link: await updateLink(parseId(id), input) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await deleteLink(parseId(id));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
