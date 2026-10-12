import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, type Actor, type ApiToken } from "@/db/schema";
import { generateRawToken, hashToken, secretsMatch } from "./actor";
import { NotFoundError } from "./repo";

/** Token metadata as exposed by the API — never the hash. */
export type TokenMeta = Omit<ApiToken, "tokenHash">;

const meta = {
  id: apiTokens.id,
  actor: apiTokens.actor,
  name: apiTokens.name,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
  revokedAt: apiTokens.revokedAt,
};

/** Throttle for last_used_at writes — at most one per token per minute. */
const TOUCH_INTERVAL_MS = 60_000;

/** Middleware lookup: active (unrevoked) token by hash, or null. */
export async function findActiveToken(
  tokenHash: string,
): Promise<{ actor: Actor; name: string } | null> {
  const [row] = await db
    .select({ ...meta, tokenHash: apiTokens.tokenHash })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row || !secretsMatch(row.tokenHash, tokenHash)) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS) {
    // conditional so concurrent requests don't all write
    await db
      .update(apiTokens)
      .set({ lastUsedAt: sql`now()` })
      .where(
        and(
          eq(apiTokens.id, row.id),
          or(
            isNull(apiTokens.lastUsedAt),
            lt(apiTokens.lastUsedAt, sql`now() - interval '1 minute'`),
          ),
        ),
      );
  }
  return { actor: row.actor, name: row.name };
}

/** Creates a token; the raw value is returned exactly once and never stored. */
export async function issueToken(
  actor: Actor,
  name: string,
): Promise<{ token: TokenMeta; rawToken: string }> {
  const rawToken = generateRawToken();
  const [token] = await db
    .insert(apiTokens)
    .values({ actor, name, tokenHash: hashToken(rawToken) })
    .returning(meta);
  return { token, rawToken };
}

export async function listTokens(): Promise<TokenMeta[]> {
  return db.select(meta).from(apiTokens).orderBy(asc(apiTokens.id));
}

/** Idempotent: revoking an already-revoked token keeps its original stamp. */
export async function revokeToken(id: number): Promise<TokenMeta> {
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
    .returning(meta);
  if (row) return row;
  const [existing] = await db.select(meta).from(apiTokens).where(eq(apiTokens.id, id));
  if (!existing) throw new NotFoundError(`token not found: ${id}`);
  return existing;
}
