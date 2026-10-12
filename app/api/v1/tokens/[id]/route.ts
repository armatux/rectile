import { NextRequest } from "next/server";
import { handleError, json, parseId, requireHuman } from "@/lib/api";
import { revokeToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Revokes (never deletes) a token — same as `npm run token:revoke -- <id>`. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    requireHuman(req, "manage tokens");
    const { id } = await params;
    return json({ token: await revokeToken(parseId(id)) });
  } catch (err) {
    return handleError(err);
  }
}
