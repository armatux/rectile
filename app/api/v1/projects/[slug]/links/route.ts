import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { addLink, getProjectDetail } from "@/lib/repo";
import { linkCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const project = await getProjectDetail(slug);
    return json({ links: project.links });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const input = linkCreateSchema.parse(await req.json());
    return json({ link: await addLink(slug, input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
