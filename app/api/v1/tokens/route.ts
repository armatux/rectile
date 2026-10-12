import { NextRequest } from "next/server";
import { handleError, json, requireHuman } from "@/lib/api";
import { issueToken, listTokens } from "@/lib/tokens";
import { tokenCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** Token metadata only — hashes never leave the database. */
export async function GET(req: NextRequest) {
  try {
    requireHuman(req, "manage tokens");
    return json({ tokens: await listTokens() });
  } catch (err) {
    return handleError(err);
  }
}

/** Issues a token; `rawToken` is in this response and nowhere else, ever. */
export async function POST(req: NextRequest) {
  try {
    requireHuman(req, "manage tokens");
    const input = tokenCreateSchema.parse(await req.json());
    return json(await issueToken(input.actor, input.name), 201);
  } catch (err) {
    return handleError(err);
  }
}
