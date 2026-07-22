import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { createProject, listProjects, type ListProjectsOpts } from "@/lib/repo";
import { projectCreateSchema, projectStatusSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const opts: ListProjectsOpts = {
      status: status ? projectStatusSchema.parse(status) : undefined,
      tag: sp.get("tag") ?? undefined,
      sort: (sp.get("sort") as ListProjectsOpts["sort"]) ?? undefined,
    };
    return json({ projects: await listProjects(opts) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = projectCreateSchema.parse(await req.json());
    const project = await createProject(input);
    return json({ project }, 201);
  } catch (err) {
    return handleError(err);
  }
}
