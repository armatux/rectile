import { runMigrations } from "../lib/migrate";
import { client } from "../db";

runMigrations()
  .then(async () => {
    console.log("migrations applied");
    await client.end();
  })
  .catch(async (err) => {
    console.error(err);
    await client.end();
    process.exit(1);
  });
