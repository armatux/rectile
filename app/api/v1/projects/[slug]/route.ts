import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { deleteProject, getProjectDetail, updateProject } from "@/lib/repo";
import { projectUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    return json({ project: await getProjectDetail(slug) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const input = projectUpdateSchema.parse(await req.json());
    return json({ project: await updateProject(slug, input) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    await deleteProject(slug);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
