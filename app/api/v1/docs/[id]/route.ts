import { NextRequest } from "next/server";
import { handleError, json, parseId } from "@/lib/api";
import { deleteDoc, getDoc, updateDoc } from "@/lib/repo";
import { docUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    return json({ doc: await getDoc(parseId(id)) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const patch = docUpdateSchema.parse(await req.json());
    return json({ doc: await updateDoc(parseId(id), patch) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await deleteDoc(parseId(id));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
