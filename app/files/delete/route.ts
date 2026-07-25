import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { handleError, json } from "@/lib/api";
import { removeStoredFile } from "@/lib/files";
import { deleteFileMeta } from "@/lib/repo";

export const dynamic = "force-dynamic";

const schema = z.object({ id: z.number().int().positive() });

/** UI-path file delete (CF-Access guarded, preflight-forced). Deleting a
 *  blob can't ride the offline ops queue — online-only, like project erase. */
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("x-rectile-files") !== "1") {
      return json({ error: "missing files header" }, 400);
    }
    const { id } = schema.parse(await req.json());
    const meta = await deleteFileMeta(id);
    await removeStoredFile(id);
    revalidatePath("/vault");
    return json({ ok: true, deleted: meta.name });
  } catch (err) {
    return handleError(err);
  }
}
