/**
 * Runs once on server boot (Next.js instrumentation hook).
 * Applies pending migrations and, if RECTILE_SEED_DEMO=1 and the DB is
 * empty, inserts the demo projects.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RECTILE_MIGRATE_ON_BOOT === "0") return;
  const { runMigrations } = await import("./lib/migrate");
  await runMigrations();
  console.log("[rectile] migrations up to date");
  if (process.env.RECTILE_SEED_DEMO === "1") {
    const { seedDemoData } = await import("./lib/seed");
    const seeded = await seedDemoData();
    if (seeded) console.log("[rectile] seeded demo data");
  }
}
