import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { handleError, json } from "@/lib/api";
import {
  FileTooLargeError,
  filePath,
  filesDir,
  streamToFile,
} from "@/lib/files";
import { addFileMeta, finalizeFileMeta, deleteFileMeta } from "@/lib/repo";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Streaming upload: POST /files/upload?name=<file.ext>[&project=<slug>]
 * with the raw file as the request body — no multipart, so nothing is
 * buffered in memory. Outside /api → Cloudflare Access guards it like every
 * UI page; the custom header forces a CORS preflight against abuse.
 */
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("x-rectile-files") !== "1") {
      return json({ error: "missing files header" }, 400);
    }
    const name = (req.nextUrl.searchParams.get("name") ?? "").trim().slice(0, 300);
    if (!name) return json({ error: "name query param required" }, 400);
    const slug = req.nextUrl.searchParams.get("project");
    let projectId: number | null = null;
    if (slug) {
      const p = await db.query.projects.findFirst({ where: eq(projects.slug, slug) });
      if (!p) return json({ error: `project not found: ${slug}` }, 404);
      projectId = p.id;
    }
    if (!req.body) return json({ error: "empty body" }, 400);

    const mime = req.headers.get("content-type") || "application/octet-stream";
    // row first so the bytes can stream straight to their id-keyed path
    const meta = await addFileMeta({ projectId, name, mime, size: 0, sha256: "" });
    const tmp = join(filesDir(), `${meta.id}.part`);
    try {
      const { size, sha256 } = await streamToFile(req.body, tmp);
      await rename(tmp, filePath(meta.id));
      await finalizeFileMeta(meta.id, { size, sha256 });
      revalidatePath("/vault");
      if (slug) revalidatePath(`/p/${slug}`);
      return json({ file: { ...meta, size, sha256 } }, 201);
    } catch (err) {
      await rm(tmp, { force: true });
      await deleteFileMeta(meta.id).catch(() => {});
      if (err instanceof FileTooLargeError) return json({ error: err.message }, 413);
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
}
