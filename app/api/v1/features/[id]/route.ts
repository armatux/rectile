import { NextRequest } from "next/server";
import { handleError, json, parseId } from "@/lib/api";
import { deleteFeature, updateFeature } from "@/lib/repo";
import { featureUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const input = featureUpdateSchema.parse(await req.json());
    return json({ feature: await updateFeature(parseId(id), input) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await deleteFeature(parseId(id));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
