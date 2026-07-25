import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { listFiles } from "@/lib/repo";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/v1/files[?project=<slug>] — vault index (bytes at /files/f/[id]) */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("project");
    let projectId: number | undefined;
    if (slug) {
      const p = await db.query.projects.findFirst({ where: eq(projects.slug, slug) });
      if (!p) return json({ error: `project not found: ${slug}` }, 404);
      projectId = p.id;
    }
    return json({ files: await listFiles(projectId) });
  } catch (err) {
    return handleError(err);
  }
}
