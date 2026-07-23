import fs from "node:fs";
import http from "node:http";

/**
 * Client for the cpptutor bridge on the laptop (bridge.py) — HTTP over a
 * unix socket that the app container bind-mounts at /bridge. No TCP port
 * exists; reaching the socket at all means being on the host or in the
 * container, and the bearer token is still required on top.
 */
const SOCKET =
  process.env.CPPTUTOR_BRIDGE_SOCKET ??
  (fs.existsSync("/bridge/bridge.sock")
    ? "/bridge/bridge.sock"
    : `/run/user/${process.getuid?.() ?? 1000}/cpptutor/bridge.sock`);

export async function bridge<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: SOCKET,
        path,
        method,
        headers: {
          Authorization: `Bearer ${process.env.API_TOKEN ?? ""}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        // a check may compile for up to 60s and then run tests
        timeout: 90_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 500,
              data: JSON.parse(Buffer.concat(chunks).toString()) as T,
            });
          } catch {
            reject(new Error("bad bridge reply"));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("bridge timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}
