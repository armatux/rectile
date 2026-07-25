import { NextRequest } from "next/server";
import { handleError, json, parseId } from "@/lib/api";
import { removeStoredFile } from "@/lib/files";
import { deleteFileMeta, getFileMeta } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    return json({ file: await getFileMeta(parseId(id)) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const n = parseId(id);
    await deleteFileMeta(n);
    await removeStoredFile(n);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
