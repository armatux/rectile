"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";

export type CalEvent = {
  id?: number; // local events only
  uid?: string; // subscription events only
  title: string;
  notes?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  source: "local" | "ics" | "reminder";
  subLabel?: string;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function shiftMonth(monthISO: string, by: number): string {
  const [y, m] = monthISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function eventColor(e: CalEvent, localColor: string): string {
  if (e.source === "ics") return "var(--color-cyan)";
  if (e.source === "reminder") return "var(--color-warn)";
  return localColor;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarView({
  monthISO,
  gridStart,
  events: serverEvents,
}: {
  monthISO: string;
  gridStart: string;
  events: CalEvent[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const todayKey = dayKey(new Date().toISOString());
  const [selected, setSelected] = useState<string>(todayKey);
  const [localAdds, setLocalAdds] = useState<CalEvent[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  const events = useMemo(
    () =>
      [...serverEvents, ...localAdds]
        .filter((e) => !(e.id !== undefined && removedIds.has(e.id)))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [serverEvents, localAdds, removedIds],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      const k = dayKey(e.startsAt);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [events]);

  const days = useMemo(() => {
    const start = new Date(gridStart).getTime();
    const out: { key: string; date: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start + i * DAY_MS);
      const key = d.toISOString().slice(0, 10);
      out.push({ key, date: d.getUTCDate(), inMonth: key.slice(0, 7) === monthISO });
      if (i >= 34 && (i + 1) % 7 === 0 && key.slice(0, 7) > monthISO) break;
    }
    return out;
  }, [gridStart, monthISO]);

  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    return events.filter((e) => e.startsAt >= now).slice(0, 6);
  }, [events]);

  const selectedEvents = byDay.get(selected) ?? [];

  function addEvent() {
    const t = title.trim();
    if (!t) return;
    const startsAt = time
      ? new Date(`${selected}T${time}:00`).toISOString()
      : new Date(`${selected}T00:00:00`).toISOString();
    const temp: CalEvent = {
      id: -Date.now(),
      title: t,
      startsAt,
      allDay: !time,
      source: "local",
    };
    setLocalAdds((ls) => [...ls, temp]);
    setTitle("");
    setTime("");
    startTransition(async () => {
      if (
        await submitOp({
          kind: "event.add",
          title: t,
          startsAt,
          allDay: !time,
          tempId: temp.id,
        })
      ) {
        router.refresh();
        setLocalAdds((ls) => ls.filter((x) => x.id !== temp.id));
      }
    });
  }

  function removeEvent(id: number) {
    setRemovedIds((s) => new Set(s).add(id));
    setLocalAdds((ls) => ls.filter((x) => x.id !== id));
    startTransition(async () => {
      if (await submitOp({ kind: "event.delete", id })) router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <section className="hud-panel flex flex-col gap-3 p-4">
        {/* month header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/calendar?m=${shiftMonth(monthISO, -1)}`}
            className="flex h-9 w-9 items-center justify-center border border-line text-ink/50 hover:border-line-strong hover:text-accent"
            aria-label="previous month"
          >
            ◂
          </Link>
          <span className="font-display text-[18px] font-bold tracking-[0.12em] text-bright">
            {new Date(`${monthISO}-01T00:00:00Z`).toLocaleDateString("en-GB", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).toUpperCase()}
          </span>
          <Link
            href={`/calendar?m=${shiftMonth(monthISO, 1)}`}
            className="flex h-9 w-9 items-center justify-center border border-line text-ink/50 hover:border-line-strong hover:text-accent"
            aria-label="next month"
          >
            ▸
          </Link>
          <Link
            href="/calendar"
            className="ml-auto text-[9px] font-bold tracking-[0.22em] text-ink/40 hover:text-accent"
          >
            TODAY
          </Link>
        </div>

        {/* grid */}
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((d) => (
            <span key={d} className="hud-sublabel px-1.5 pb-1">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const evs = byDay.get(d.key) ?? [];
            const isToday = d.key === todayKey;
            const isSelected = d.key === selected;
            return (
              <button
                key={d.key}
                onClick={() => setSelected(d.key)}
                className={`flex min-h-[72px] flex-col items-stretch gap-0.5 border p-1.5 text-left transition-colors sm:min-h-[84px] ${
                  isSelected
                    ? "border-line-strong bg-accent/10"
                    : "border-line hover:border-line-strong"
                } ${d.inMonth ? "" : "opacity-35"}`}
              >
                <span
                  className={`text-[10px] font-bold ${
                    isToday ? "text-accent" : "text-ink/60"
                  }`}
                >
                  {d.date}
                  {isToday && <span className="ml-1">●</span>}
                </span>
                {evs.slice(0, 3).map((e, i) => (
                  <span
                    key={i}
                    className="truncate text-[8.5px] leading-tight"
                    style={{ color: eventColor(e, "var(--color-accent)") }}
                  >
                    {e.allDay ? "" : `${fmtTime(e.startsAt)} `}
                    {e.title}
                  </span>
                ))}
                {evs.length > 3 && (
                  <span className="text-[8px] text-ink/40">+{evs.length - 3}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {/* selected day */}
        <section className="hud-panel flex flex-col gap-2 p-4">
          <span className="hud-sublabel">
            {new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "2-digit",
              month: "short",
              timeZone: "UTC",
            }).toUpperCase()}
          </span>
          {selectedEvents.length === 0 && (
            <p className="py-2 text-[10px] tracking-[0.14em] text-ink/30">NO EVENTS</p>
          )}
          {selectedEvents.map((e, i) => (
            <div key={e.id ?? e.uid ?? i} className="group flex items-baseline gap-2">
              <span className="w-11 flex-none text-[9.5px] tabular-nums text-ink/50">
                {e.allDay ? "DAY" : fmtTime(e.startsAt)}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[11.5px]"
                style={{ color: eventColor(e, "var(--color-ink)") }}
                title={e.notes}
              >
                {e.title}
                {e.subLabel && (
                  <span className="ml-2 text-[8.5px] tracking-[0.14em] text-ink/35">
                    {e.subLabel.toUpperCase()}
                  </span>
                )}
              </span>
              {e.source === "local" && e.id !== undefined && (
                <button
                  onClick={() => removeEvent(e.id!)}
                  className="h-7 w-7 flex-none text-[11px] text-ink/20 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`delete ${e.title}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {/* quick add */}
          <form
            className="mt-1 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addEvent();
            }}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="+ event"
              className="min-h-[40px] w-full min-w-0 border border-line bg-panel/70 px-2.5 text-[11px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="min-h-[40px] w-24 flex-none border border-line bg-panel/70 px-2 text-[11px] text-bright focus:border-line-strong focus:outline-none [color-scheme:dark]"
              aria-label="time (empty = all day)"
            />
            <button
              type="submit"
              className="min-h-[40px] flex-none border border-line-strong px-3 text-[9px] font-bold tracking-[0.2em] text-accent hover:bg-accent/10"
            >
              ADD
            </button>
          </form>
        </section>

        {/* upcoming */}
        <section className="hud-panel flex flex-col gap-2 p-4">
          <span className="hud-sublabel">UPCOMING</span>
          {upcoming.length === 0 && (
            <p className="py-2 text-[10px] tracking-[0.14em] text-ink/30">
              NOTHING SCHEDULED
            </p>
          )}
          {upcoming.map((e, i) => (
            <button
              key={e.id ?? e.uid ?? i}
              onClick={() => setSelected(dayKey(e.startsAt))}
              className="flex items-baseline gap-2 text-left hover:text-bright"
            >
              <span className="w-20 flex-none text-[9.5px] tabular-nums text-ink/50">
                {new Date(e.startsAt).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
                {!e.allDay && ` ${fmtTime(e.startsAt)}`}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[11px]"
                style={{ color: eventColor(e, "var(--color-ink)") }}
              >
                {e.title}
              </span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
