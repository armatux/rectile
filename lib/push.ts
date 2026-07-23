import webpush from "web-push";
import {
  deletePushSubscription,
  dueUnnotifiedReminders,
  listPushSubscriptions,
  markRemindersNotified,
} from "./repo";

/**
 * Web Push (VAPID) delivery + the reminder deadline notifier.
 *
 * Works on iPhone/iPad too: iOS ≥ 16.4 delivers standard Web Push to PWAs
 * installed on the home screen — no APNs account needed, VAPID is enough.
 */

const PUBLIC = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;

export function vapidPublicKey(): string | null {
  return PUBLIC ?? null;
}

let configured = false;
function ensureConfigured(): boolean {
  if (!configured && PUBLIC && PRIVATE) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:armatux@pm.me",
      PUBLIC,
      PRIVATE,
    );
    configured = true;
  }
  return configured;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

/** Send to every registered device; prunes endpoints the push service killed. */
export async function broadcastPush(payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await listPushSubscriptions();
  let sent = 0;
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600 },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await deletePushSubscription(s.endpoint);
        else console.error("[rectile push]", code ?? err);
      }
    }),
  );
  return sent;
}

const CHECK_MS = 60_000;

/** Once a minute: push every reminder whose deadline just passed. */
export function startReminderNotifier(): void {
  if (!ensureConfigured()) {
    console.log("[rectile] reminder notifier off (no VAPID keys)");
    return;
  }
  const g = globalThis as { __rectileNotifier?: boolean };
  if (g.__rectileNotifier) return;
  g.__rectileNotifier = true;
  const timer = setInterval(async () => {
    try {
      const due = await dueUnnotifiedReminders();
      if (!due.length) return;
      // mark first: a crash mid-send means a missed push, never a spam loop
      await markRemindersNotified(due.map((r) => r.id));
      for (const r of due) {
        await broadcastPush({
          title: `⏰ ${r.title}`,
          body: r.notes ?? "reminder due",
          url: "/reminders",
          tag: `reminder-${r.id}`,
        });
      }
    } catch (err) {
      console.error("[rectile notifier]", err);
    }
  }, CHECK_MS);
  timer.unref?.();
  console.log("[rectile] reminder notifier armed");
}
