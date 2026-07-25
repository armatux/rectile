import type { Op } from "./ops";

/**
 * Offline write queue: mutations made while the server is unreachable are
 * stored in IndexedDB (in order) and replayed against POST /sync/ops when
 * the link returns. Queue changes emit "rectile:queue-change" with the
 * current count so UI (OfflineSync badge) can react.
 */

const DB_NAME = "rectile-offline";
const STORE = "ops";
export const QUEUE_EVENT = "rectile:queue-change";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

async function emit() {
  const count = await queueCount().catch(() => 0);
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { count } }));
}

export function queueCount(): Promise<number> {
  return tx("readonly", (s) => s.count());
}

export async function enqueue(op: Op): Promise<void> {
  await tx("readwrite", (s) => s.add(op));
  await emit();
  // Background Sync (Chromium): if every tab closes before the link returns,
  // the SW flushes the queue as soon as the device reconnects.
  try {
    const reg = await navigator.serviceWorker?.ready;
    await (
      reg as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    )?.sync?.register("rectile-flush");
  } catch {
    /* unsupported (Firefox/iOS) — queue still flushes on next visit */
  }
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

/**
 * Durable mutate: queue first (survives navigations and crashes), then try
 * to deliver immediately. Every UI mutation goes through here — server
 * actions are deliberately NOT used for writes, because Next.js reacts to
 * a failed action POST with a recovery hard-navigation that can outrun any
 * catch-and-queue logic.
 *
 * Returns true when the op reached the server (caller should refresh).
 */
export async function submitOp(op: Op): Promise<boolean> {
  await enqueue(op);
  const { sent } = await flushQueue();
  return sent > 0;
}

let flushing = false;
let rerun = false;

/** Replay all queued ops in order. Safe to call repeatedly/concurrently. */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  if (isOffline()) return { sent: 0, remaining: await queueCount().catch(() => 0) };
  if (flushing) {
    rerun = true; // the in-flight flush loops again and picks our ops up
    return { sent: 0, remaining: await queueCount().catch(() => 0) };
  }
  flushing = true;
  try {
    let sent = 0;
    for (;;) {
      rerun = false;
      const [keys, ops] = await Promise.all([
        tx("readonly", (s) => s.getAllKeys()),
        tx("readonly", (s) => s.getAll() as IDBRequest<Op[]>),
      ]);
      if (!ops.length) return { sent, remaining: 0 };

      let res: Response;
      try {
        res = await fetch("/sync/ops", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // forces a CORS preflight, which blocks cross-origin abuse
            "X-Rectile-Sync": "1",
          },
          body: JSON.stringify({ ops }),
        });
      } catch {
        return { sent, remaining: ops.length }; // unreachable — retry later
      }
      if (!res.ok && res.status !== 400) {
        return { sent, remaining: ops.length }; // server error — retry later
      }
      // applied (per-op failures are reported and dropped — no poison pills)
      if (res.ok) {
        const { results } = (await res.json()) as { results: { ok: boolean; error?: string }[] };
        results.forEach((r, i) => {
          if (!r.ok) console.warn("[rectile offline] op dropped:", ops[i], r.error);
        });
      } else {
        console.warn("[rectile offline] queue batch rejected, dropping", ops.length, "ops");
      }
      await Promise.all(keys.map((k) => tx("readwrite", (s) => s.delete(k))));
      await emit();
      sent += ops.length;
      if (!rerun) return { sent, remaining: 0 };
    }
  } finally {
    flushing = false;
  }
}
