import { seedDemoData } from "../lib/seed";
import { client } from "../db";

seedDemoData()
  .then(async (seeded) => {
    console.log(seeded ? "demo data seeded" : "database not empty — skipped");
    await client.end();
  })
  .catch(async (err) => {
    console.error(err);
    await client.end();
    process.exit(1);
  });
