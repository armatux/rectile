import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { search } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    if (!q.trim()) return json({ error: "missing query parameter: q" }, 400);
    return json({ results: await search(q) });
  } catch (err) {
    return handleError(err);
  }
}
