import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { createTag, listTags } from "@/lib/repo";
import { tagCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ tags: await listTags() });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = tagCreateSchema.parse(await req.json());
    return json({ tag: await createTag(input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
