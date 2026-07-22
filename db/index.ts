import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Connection is configured either via DATABASE_URL or via discrete
 * POSTGRES_* variables. Discrete vars avoid URL-encoding issues when the
 * password contains characters like `?` or `&`.
 */
function createClient() {
  if (process.env.DATABASE_URL) {
    return postgres(process.env.DATABASE_URL, { max: 10 });
  }
  return postgres({
    host: process.env.POSTGRES_HOST ?? "db",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER ?? "rectile",
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB ?? "rectile",
    max: 10,
  });
}

const globalForDb = globalThis as unknown as {
  __rectileSql?: ReturnType<typeof createClient>;
};

export const client = (globalForDb.__rectileSql ??= createClient());
export const db = drizzle(client, { schema });
