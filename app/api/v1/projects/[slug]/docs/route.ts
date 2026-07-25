import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { addDoc, listDocs, requireProject } from "@/lib/repo";
import { docCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const p = await requireProject(slug);
    return json({ docs: await listDocs(p.id) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const input = docCreateSchema.parse(await req.json());
    return json({ doc: await addDoc(slug, input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
