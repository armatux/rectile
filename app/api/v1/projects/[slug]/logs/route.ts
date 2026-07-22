import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { addLogEntry, getProjectDetail } from "@/lib/repo";
import { logCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const project = await getProjectDetail(slug);
    return json({ logEntries: project.logEntries });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const input = logCreateSchema.parse(await req.json());
    return json({ logEntry: await addLogEntry(slug, input.body) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
