import { NextRequest } from "next/server";
import { handleError, json, parseId } from "@/lib/api";
import { deleteTag, updateTag } from "@/lib/repo";
import { tagUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const input = tagUpdateSchema.parse(await req.json());
    return json({ tag: await updateTag(parseId(id), input) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await deleteTag(parseId(id));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
