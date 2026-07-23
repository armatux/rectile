import webpush from "web-push";
import {
  deletePushSubscription,
  dueUnnotifiedReminders,
  getKv,
  listOpenRemindersDue,
  listProjects,
  listPushSubscriptions,
  markRemindersNotified,
  setKv,
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
  /** present on deadline pushes — enables snooze actions in the SW */
  reminderId?: number;
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
const TZ = process.env.RECTILE_TZ ?? "Europe/Berlin";
const DIGEST_TIME = process.env.RECTILE_DIGEST_TIME ?? "08:00"; // "" disables
const DIGEST_KV_KEY = "digest_last_sent";

/** "YYYY-MM-DD" / "HH:MM" of a Date in the user's timezone. */
function localParts(d: Date): { date: string; hm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hm: `${get("hour")}:${get("minute")}`,
  };
}

/** Morning brief: due/overdue reminders + today's events + stalest project. */
async function maybeSendDigest(nowDate: Date): Promise<void> {
  if (!DIGEST_TIME) return;
  const { date, hm } = localParts(nowDate);
  if (hm < DIGEST_TIME) return;
  const last = await getKv<string>(DIGEST_KV_KEY);
  if (last?.value === date) return;
  await setKv(DIGEST_KV_KEY, date); // claim before send — at-most-once

  const nowISO = nowDate.toISOString();
  const due = await listOpenRemindersDue(new Date(nowDate.getTime() + 86_400_000));
  const dueToday = due.filter(
    (r) => r.dueAt && localParts(r.dueAt).date === date && r.dueAt.toISOString() >= nowISO,
  );
  const overdue = due.filter((r) => r.dueAt && r.dueAt.toISOString() < nowISO);
  const projects = await listProjects({ sort: "staleness" });
  const stalest = projects.find((p) => p.status !== "done" && p.status !== "archived");

  const lines: string[] = [];
  if (overdue.length)
    lines.push(`${overdue.length} overdue: ${overdue.slice(0, 3).map((r) => r.title).join(", ")}`);
  if (dueToday.length)
    lines.push(`due today: ${dueToday.slice(0, 4).map((r) => r.title).join(", ")}`);
  if (!overdue.length && !dueToday.length) lines.push("no deadlines today");
  if (stalest) {
    const days = Math.floor(
      (nowDate.getTime() - new Date(stalest.lastTouchedAt).getTime()) / 86_400_000,
    );
    lines.push(`stalest: ${stalest.name} (${days}d)`);
  }

  const sent = await broadcastPush({
    title: "☀ DAILY BRIEF",
    body: lines.join("\n"),
    url: "/reminders",
    tag: "daily-digest",
  });
  console.log(`[rectile] daily digest sent to ${sent} device(s)`);
}

/** Once a minute: deadline pushes + the daily digest. */
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
      if (due.length) {
        // mark first: a crash mid-send means a missed push, never a spam loop
        await markRemindersNotified(due.map((r) => r.id));
        for (const r of due) {
          await broadcastPush({
            title: `⏰ ${r.title}`,
            body: r.notes ?? "reminder due",
            url: "/reminders",
            tag: `reminder-${r.id}`,
            reminderId: r.id,
          });
        }
      }
      await maybeSendDigest(new Date());
    } catch (err) {
      console.error("[rectile notifier]", err);
    }
  }, CHECK_MS);
  timer.unref?.();
  console.log("[rectile] reminder notifier armed");
}
