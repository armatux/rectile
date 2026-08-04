"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flushQueue, queueCount, QUEUE_EVENT } from "@/lib/offline/queue";

/**
 * Watches the offline write queue: flushes it on load and whenever the
 * link returns, and shows a small fixed badge while ops are queued
 * (tap = retry now). Invisible when everything is synced and online.
 */
export function OfflineSync() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const flush = useCallback(async () => {
    setBusy(true);
    try {
      const { sent, remaining } = await flushQueue();
      setCount(remaining);
      if (sent > 0) router.refresh();
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    setOffline(!navigator.onLine);
    queueCount().then(setCount).catch(() => {});
    void flush();

    const onQueue = (e: Event) => setCount((e as CustomEvent).detail.count);
    const onOnline = () => {
      setOffline(false);
      void flush();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener(QUEUE_EVENT, onQueue);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // navigator.onLine can't see a down server — retry while ops are queued
    const retry = setInterval(() => {
      void queueCount().then((n) => {
        if (n > 0) void flush();
      });
    }, 30_000);
    return () => {
      window.removeEventListener(QUEUE_EVENT, onQueue);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(retry);
    };
  }, [flush]);

  if (!offline && count === 0) return null;

  return (
    <button
      onClick={() => void flush()}
      disabled={busy}
      className="glass fixed bottom-4 right-4 z-50 flex min-h-[40px] items-center gap-2 px-4 text-[12px] font-medium"
      style={{ borderRadius: 999 }}
      title={offline ? "offline — queued writes sync on reconnect" : "tap to sync now"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${offline ? "pulse-dot" : ""}`}
        style={{
          background: offline ? "var(--color-danger)" : "var(--color-warn)",
        }}
        aria-hidden
      />
      <span className={offline ? "text-danger" : "text-warn"}>
        {offline ? "Offline" : busy ? "Syncing…" : "Sync"}
      </span>
      {count > 0 && <span className="text-bright tabular-nums">{count} queued</span>}
    </button>
  );
}
