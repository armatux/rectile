import { client } from "../db";
import { isActor } from "../lib/actor";
import { issueToken } from "../lib/tokens";

/** npm run token:issue -- <human|orchestrator|code|visual> <name...> */
const [actor, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();

if (!isActor(actor) || !name || name.length > 100) {
  console.error("usage: npm run token:issue -- <human|orchestrator|code|visual> <name>");
  process.exit(1);
}

issueToken(actor, name)
  .then(async ({ token, rawToken }) => {
    console.log(`issued token #${token.id} for actor "${token.actor}" (${token.name})`);
    console.log("");
    console.log(rawToken);
    console.log("");
    console.log("Store it now: only its SHA-256 hash is kept, it cannot be shown again.");
    await client.end();
  })
  .catch(async (err) => {
    console.error(err);
    await client.end();
    process.exit(1);
  });
