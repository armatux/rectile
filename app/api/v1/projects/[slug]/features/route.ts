import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { addFeature, getProjectDetail } from "@/lib/repo";
import { featureCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const project = await getProjectDetail(slug);
    return json({ features: project.features });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const input = featureCreateSchema.parse(await req.json());
    return json({ feature: await addFeature(slug, input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
