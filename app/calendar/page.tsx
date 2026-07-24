import { SectionHeader } from "@/components/hud";
import { HudChrome } from "@/components/hud/HudChrome";
import { CalendarView, type CalEvent } from "@/components/calendar/CalendarView";
import { SubscriptionsPanel, type CalSub } from "@/components/calendar/SubscriptionsPanel";
import { getHudChrome } from "@/lib/hud";
import { parseIcs } from "@/lib/ics";
import { getKv, listEvents, listOpenRemindersDue } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "calendar" };

type SP = Promise<Record<string, string | string[] | undefined>>;

function monthOf(raw: string | undefined): { year: number; month: number } {
  const m = raw && /^(\d{4})-(\d{2})$/.exec(raw);
  if (m) return { year: +m[1], month: +m[2] - 1 };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { year, month } = monthOf(typeof sp.m === "string" ? sp.m : undefined);

  /* grid window: Monday before the 1st → Sunday after the last day */
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (7 - ((last.getUTCDay() + 6) % 7)) % 7);
  end.setUTCHours(23, 59, 59);

  const [local, subsEntry, deadlines, chrome] = await Promise.all([
    listEvents(start, end),
    getKv<CalSub[]>("calendar_subscriptions"),
    listOpenRemindersDue(end, start),
    getHudChrome(),
  ]);
  const subs = subsEntry?.value ?? [];

  const events: CalEvent[] = local.map((e) => ({
    id: e.id,
    title: e.title,
    notes: e.notes ?? undefined,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString(),
    allDay: e.allDay,
    source: "local",
  }));

  for (const r of deadlines) {
    if (!r.dueAt) continue;
    events.push({
      uid: `rem-${r.id}`,
      title: `⚑ ${r.title}`,
      startsAt: r.dueAt.toISOString(),
      allDay: false,
      source: "reminder",
      subLabel: "due",
    });
  }

  const subErrors: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const res = await fetch(sub.url, {
          next: { revalidate: 600 },
          headers: { "User-Agent": "rectile-calendar/1.0" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        for (const ev of parseIcs(await res.text(), start, end)) {
          events.push({
            uid: ev.uid,
            title: ev.title,
            notes: ev.location,
            startsAt: ev.startsAt.toISOString(),
            endsAt: ev.endsAt?.toISOString(),
            allDay: ev.allDay,
            source: "ics",
            subLabel: sub.label,
          });
        }
      } catch (err) {
        subErrors.push(`${sub.label}: ${String((err as Error)?.message ?? err)}`);
      }
    }),
  );

  const monthISO = `${year}-${String(month + 1).padStart(2, "0")}`;

  return (
    <HudChrome data={chrome} mode="cal">
      <div className="flex flex-col gap-6 lg:pb-4">
        <SectionHeader label="CALENDAR" sub={monthISO} />
        <CalendarView
          monthISO={monthISO}
          gridStart={start.toISOString()}
          events={events}
        />
        <SectionHeader label="SUBSCRIPTIONS" sub={`×${subs.length}`} />
        <SubscriptionsPanel subs={subs} errors={subErrors} />
      </div>
    </HudChrome>
  );
}
