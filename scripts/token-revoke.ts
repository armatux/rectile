import { client } from "../db";
import { revokeToken } from "../lib/tokens";

/** npm run token:revoke -- <id> */
const id = Number(process.argv[2]);

if (!Number.isInteger(id) || id < 1) {
  console.error("usage: npm run token:revoke -- <id>");
  process.exit(1);
}

revokeToken(id)
  .then(async (token) => {
    console.log(
      `revoked token #${token.id} (${token.actor}, ${token.name}) at ${token.revokedAt?.toISOString()}`,
    );
    await client.end();
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await client.end();
    process.exit(1);
  });
