/**
 * Runs once on server boot (Next.js instrumentation hook).
 * Applies pending migrations and, if RECTILE_SEED_DEMO=1 and the DB is
 * empty, inserts the demo projects. Also starts the mail-bridge socket
 * forwarders and the reminder push notifier.
 */

/**
 * TCP→unix forwarders so imapflow/nodemailer can reach the Proton Bridge
 * through a bind-mounted socket dir (MAIL_SOCKET_DIR). The bridge lives on
 * the host's loopback; TCP via host.containers.internal goes stale whenever
 * the host changes networks, a mounted socket never does.
 */
async function startMailSocketForwarders() {
  const dir = process.env.MAIL_SOCKET_DIR;
  if (!dir) return;
  const net = await import("net");
  const { join } = await import("path");
  const routes: [number, string][] = [
    [Number(process.env.PROTON_BRIDGE_IMAP_PORT ?? 1143), "imap.sock"],
    [Number(process.env.PROTON_BRIDGE_SMTP_PORT ?? 1025), "smtp.sock"],
  ];
  for (const [port, sock] of routes) {
    const target = join(dir, sock);
    const srv = net.createServer((client) => {
      const up = net.connect(target);
      client.pipe(up);
      up.pipe(client);
      const drop = () => {
        client.destroy();
        up.destroy();
      };
      client.on("error", drop);
      up.on("error", drop);
      client.on("close", () => up.destroy());
      up.on("close", () => client.destroy());
    });
    srv.on("error", (err) => console.error("[rectile] mail fwd", err));
    srv.listen(port, "127.0.0.1", () =>
      console.log(`[rectile] mail fwd 127.0.0.1:${port} -> ${target}`),
    );
  }
}

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
  await startMailSocketForwarders();
  const { startReminderNotifier } = await import("./lib/push");
  startReminderNotifier();
}
