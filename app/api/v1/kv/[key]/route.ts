import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { getKv, NotFoundError, setKv } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

const KEY_RE = /^[a-z0-9_-]{1,64}$/;

function parseKey(raw: string): string {
  if (!KEY_RE.test(raw)) throw new NotFoundError(`invalid key: ${raw}`);
  return raw;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const key = parseKey((await params).key);
    const entry = await getKv(key);
    if (!entry) throw new NotFoundError(`no value for key: ${key}`);
    return json({ key, ...entry });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const key = parseKey((await params).key);
    const raw = await req.text();
    if (raw.length > 20_000) return json({ error: "value too large" }, 413);
    const value = JSON.parse(raw);
    await setKv(key, value);
    return json({ key, value });
  } catch (err) {
    return handleError(err);
  }
}
