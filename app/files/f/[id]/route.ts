import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { handleError, json, parseId } from "@/lib/api";
import { filePath, storedFileSize } from "@/lib/files";
import { getFileMeta, NotFoundError } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Stream a stored file. ?dl=1 forces download, default renders inline
 *  (images / audio / video / glb previews load from here). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    const meta = await getFileMeta(id);
    const size = await storedFileSize(id);
    if (size === null) throw new NotFoundError(`file bytes missing: ${id}`);
    const stream = Readable.toWeb(
      createReadStream(filePath(id)),
    ) as ReadableStream<Uint8Array>;
    const disposition = req.nextUrl.searchParams.get("dl") ? "attachment" : "inline";
    return new Response(stream, {
      headers: {
        "Content-Type": meta.mime,
        "Content-Length": String(size),
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(meta.name)}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return json({ error: err.message }, 404);
    return handleError(err);
  }
}
