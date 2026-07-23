"use client";

import { useEffect, useState } from "react";

type State = "busy" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosBrowserTab(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Subscribe/unsubscribe this device for reminder deadline pushes. */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("busy");
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    (async () => {
      if (
        !vapidKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setIosHint(typeof navigator !== "undefined" && isIosBrowserTab());
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return setState("unsupported");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return setState("unsupported");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!),
      });
      const res = await fetch("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Rectile-Push": "1" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(`subscribe ${res.status}`);
      setState("on");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "X-Rectile-Push": "1" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  const btn =
    "min-h-[42px] border border-line-strong px-3 text-[9px] font-bold tracking-[0.2em] transition-colors";

  if (state === "busy")
    return <span className="text-[10px] tracking-[0.2em] text-ink/30">…</span>;
  if (state === "unsupported")
    return (
      <p className="text-[10px] tracking-[0.1em] text-ink/40">
        {iosHint
          ? "ON IPHONE: SHARE → ADD TO HOME SCREEN, THEN OPEN THE APP FROM THERE"
          : "PUSH NOT AVAILABLE HERE"}
      </p>
    );
  if (state === "denied")
    return (
      <p className="text-[10px] tracking-[0.1em]" style={{ color: "var(--color-danger)" }}>
        NOTIFICATIONS BLOCKED — ALLOW THEM IN BROWSER/SYSTEM SETTINGS
      </p>
    );
  return state === "on" ? (
    <button onClick={disable} className={`${btn} text-accent hover:bg-accent/10`}>
      ● ALERTS ON — THIS DEVICE · DISABLE
    </button>
  ) : (
    <button onClick={enable} className={`${btn} text-ink/60 hover:text-accent hover:bg-accent/10`}>
      ○ ENABLE ALERTS ON THIS DEVICE
    </button>
  );
}
