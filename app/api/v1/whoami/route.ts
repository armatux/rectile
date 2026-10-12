import { NextRequest } from "next/server";
import { handleError, json, requireActor } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { actor, tokenName } = requireActor(req);
    return json({ actor, tokenName });
  } catch (err) {
    return handleError(err);
  }
}
