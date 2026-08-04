import type {
  HudChromeData,
  HudProject,
  HudUpcoming,
  LauncherApp,
} from "@/lib/hud-types";
import type { CpptutorProgress } from "@/lib/cpptutor";
import { getAccount, listFolders } from "@/lib/mail";
import {
  getKv,
  getVitals,
  listEvents,
  listOpenRemindersDue,
  listProjects,
  type ProjectSummary,
} from "@/lib/repo";
import { stalenessTier } from "@/lib/ui";

const MS_DAY = 86_400_000;

function slim(p: ProjectSummary): HudProject {
  const pct = p.featuresTotal > 0 ? Math.round((p.featuresBuilt / p.featuresTotal) * 100) : 0;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    priority: p.priority,
    built: p.featuresBuilt,
    total: p.featuresTotal,
    pct,
    idleDays: Math.floor((Date.now() - p.lastTouchedAt.getTime()) / MS_DAY),
    ageDays: Math.floor((Date.now() - p.createdAt.getTime()) / MS_DAY),
    tier: stalenessTier(p.lastTouchedAt),
    nextAction: p.nextAction,
    nextActionFeatureId: p.nextActionFeatureId,
  };
}

function fmtWhen(d: Date, allDay: boolean): string {
  const day = d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
  if (allDay) return day;
  return `${day} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** INBOX unseen count, or null when no account / bridge unreachable.
 *  Race-guarded so a wedged IMAP link can never stall the dashboard. */
async function mailUnread(): Promise<number | null> {
  const acc = getAccount(undefined);
  if (!acc) return null;
  try {
    const folders = await Promise.race([
      listFolders(acc),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000)),
    ]);
    const inbox = folders.find((f) => f.path === "INBOX") ?? folders[0];
    return inbox?.unseen ?? 0;
  } catch {
    return null;
  }
}

function buildBriefs(
  projects: HudProject[],
  upcoming: HudUpcoming[],
  tutor: CpptutorProgress | null,
  unread: number | null,
): string[] {
  const briefs: string[] = [];
  const tracked = projects.filter((p) => p.status !== "done" && p.status !== "archived");
  const stalest = tracked[0];
  if (stalest && stalest.idleDays >= 7) {
    briefs.push(
      `${stalest.name} is ${stalest.tier === "dying" ? "dying" : "going stale"} — idle ${stalest.idleDays} days.` +
        (stalest.nextAction ? ` Next move: ${stalest.nextAction}` : ""),
    );
  }
  const hot = tracked.filter((p) => p.idleDays >= 7);
  if (hot.length > 1) {
    briefs.push(
      `${hot.length} projects need attention. Worst offenders: ${hot
        .slice(0, 3)
        .map((p) => p.name)
        .join(", ")}.`,
    );
  }
  const fresh = tracked.filter((p) => p.idleDays === 0);
  if (fresh.length > 0) {
    briefs.push(
      `Touched today: ${fresh.map((p) => p.name).join(", ")}. Momentum holds.`,
    );
  }
  if (upcoming[0]) {
    briefs.push(`Next on the clock — ${upcoming[0].when}: ${upcoming[0].title}.`);
  }
  if (tutor?.next_lesson) {
    briefs.push(
      `Training: level ${tutor.level}, ${tutor.title}, ${tutor.done} of ${tutor.total} lessons. Next up: ${tutor.next_lesson}.`,
    );
  }
  if (unread !== null && unread > 0) {
    briefs.push(`${unread} unread message${unread === 1 ? "" : "s"} in the inbox.`);
  }
  if (briefs.length === 0) {
    briefs.push("All clear. Nothing stale, nothing due. Pick a project and build.");
  }
  return briefs;
}

export async function getHudChrome(): Promise<HudChromeData> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * MS_DAY);
  const [all, tutorKv, reminders, events, unread, launcherKv] = await Promise.all([
    listProjects({ sort: "staleness" }),
    getKv<CpptutorProgress>("cpptutor_progress"),
    listOpenRemindersDue(horizon),
    listEvents(now, horizon),
    mailUnread(),
    getKv<LauncherApp[]>("app_launcher"),
  ]);

  const live = all.filter((p) => p.status !== "archived");
  // roster: stalest first, finished work sinks to the bottom
  const rank = (p: HudProject) => (p.status === "done" ? 1 : 0);
  const projects = live
    .map(slim)
    .sort((a, b) => rank(a) - rank(b) || b.idleDays - a.idleDays);

  const vitals = await getVitals(live);

  const upcoming: HudUpcoming[] = [
    ...events.map((e) => ({
      when: fmtWhen(e.startsAt, e.allDay),
      title: e.title,
      href: `/calendar?m=${e.startsAt.toISOString().slice(0, 7)}`,
      source: "event" as const,
      at: e.startsAt.getTime(),
    })),
    ...reminders
      .filter((r) => r.dueAt)
      .map((r) => ({
        when: fmtWhen(r.dueAt!, false),
        title: r.title,
        href: "/reminders",
        source: "reminder" as const,
        at: r.dueAt!.getTime(),
      })),
  ]
    .sort((a, b) => a.at - b.at)
    .map(({ at, ...rest }) => (void at, rest));

  const tutor = tutorKv
    ? { data: tutorKv.value, updatedAt: tutorKv.updatedAt.toISOString() }
    : null;

  return {
    projects,
    vitals,
    tutor,
    upcoming,
    mailUnread: unread,
    briefs: buildBriefs(projects, upcoming, tutor?.data ?? null, unread),
    launcher: Array.isArray(launcherKv?.value) ? launcherKv.value : [],
  };
}
