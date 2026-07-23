"use client";

import { useEffect } from "react";

const THROTTLE_MS = 10 * 60 * 1000;
const STAMP_KEY = "rectile-precache-at";

/**
 * Mounted on the dashboard with the full page list: asks the service
 * worker to precache every project page so anything opens offline even
 * if it was never visited on this device. Throttled to once per 10 min.
 */
export function PrecachePing({ urls }: { urls: string[] }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const last = Number(localStorage.getItem(STAMP_KEY) ?? 0);
    if (Date.now() - last < THROTTLE_MS) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        reg.active?.postMessage({ type: "PRECACHE", urls });
        localStorage.setItem(STAMP_KEY, String(Date.now()));
      })
      .catch(() => {});
  }, [urls]);
  return null;
}
