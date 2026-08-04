"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseRemindTag } from "@/lib/nl";
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
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("");
  const [patchedEvents, setPatchedEvents] = useState<
    Map<number, Partial<CalEvent>>
  >(new Map());

  const events = useMemo(
    () =>
      [...serverEvents, ...localAdds]
        .filter((e) => !(e.id !== undefined && removedIds.has(e.id)))
        .map((e) =>
          e.id !== undefined && patchedEvents.has(e.id)
            ? { ...e, ...patchedEvents.get(e.id)! }
            : e,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [serverEvents, localAdds, removedIds, patchedEvents],
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
    const raw = title.trim();
    if (!raw) return;
    // "!30m" / "!2h" / "!1d" / "!remind" spawns a pre-event reminder push
    const { text: t, remindBeforeMin } = parseRemindTag(raw);
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
          remindBeforeMin,
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

  function saveEventEdit(e: CalEvent) {
    const t = editTitle.trim();
    setEditId(null);
    if (!t || e.id === undefined) return;
    const startsAt = editTime
      ? new Date(`${selected}T${editTime}:00`).toISOString()
      : new Date(`${selected}T00:00:00`).toISOString();
    const allDay = !editTime;
    setPatchedEvents((m) => new Map(m).set(e.id!, { title: t, startsAt, allDay }));
    startTransition(async () => {
      if (
        await submitOp({
          kind: "event.update",
          id: e.id!,
          patch: { title: t, startsAt, allDay },
        })
      ) {
        router.refresh();
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <section className="glass flex flex-col gap-3 p-4">
        {/* month header */}
        <div className="flex items-center gap-1.5">
          <Link
            href={`/calendar?m=${shiftMonth(monthISO, -1)}`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[19px] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright"
            aria-label="previous month"
          >
            ‹
          </Link>
          <span className="font-display text-[18px] font-semibold tracking-[-0.01em] text-bright">
            {new Date(`${monthISO}-01T00:00:00Z`).toLocaleDateString("en-GB", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
          <Link
            href={`/calendar?m=${shiftMonth(monthISO, 1)}`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[19px] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright"
            aria-label="next month"
          >
            ›
          </Link>
          <Link
            href="/calendar"
            className="ml-auto text-[13px] font-medium text-accent hover:text-[#409cff]"
          >
            Today
          </Link>
        </div>

        {/* grid */}
        <div className="grid grid-cols-7 gap-1">
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
                className={`flex min-h-[72px] flex-col items-stretch gap-0.5 rounded-xl p-1.5 text-left transition-colors sm:min-h-[84px] ${
                  isSelected ? "bg-white/10" : "hover:bg-white/5"
                } ${d.inMonth ? "" : "opacity-35"}`}
              >
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] ${
                    isToday
                      ? "bg-accent font-semibold text-white"
                      : "font-medium text-ink/70"
                  }`}
                >
                  {d.date}
                </span>
                {evs.slice(0, 3).map((e, i) => {
                  const c = eventColor(e, "var(--color-accent)");
                  return (
                    <span
                      key={i}
                      className="truncate rounded-full px-1.5 py-px text-[11px] leading-snug"
                      style={{
                        color: c,
                        background: `color-mix(in srgb, ${c} 14%, transparent)`,
                      }}
                    >
                      {e.allDay ? "" : `${fmtTime(e.startsAt)} `}
                      {e.title}
                    </span>
                  );
                })}
                {evs.length > 3 && (
                  <span className="px-1.5 text-[11px] text-ink/40">
                    +{evs.length - 3}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {/* selected day */}
        <section className="glass flex flex-col gap-2 p-4">
          <span className="hud-label">
            {new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "2-digit",
              month: "short",
              timeZone: "UTC",
            })}
          </span>
          {selectedEvents.length === 0 && (
            <p className="py-2 text-[12px] text-ink/40">No events</p>
          )}
          {selectedEvents.map((e, i) => (
            <div key={e.id ?? e.uid ?? i} className="group flex items-baseline gap-2">
              {e.id !== undefined && editId === e.id ? (
                <span className="flex min-w-0 flex-1 items-center gap-2 py-0.5">
                  <input
                    type="time"
                    value={editTime}
                    onChange={(ev) => setEditTime(ev.target.value)}
                    className="field max-w-24 flex-none [color-scheme:dark]"
                    aria-label="event time (empty = all day)"
                  />
                  <input
                    value={editTitle}
                    onChange={(ev) => setEditTitle(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") saveEventEdit(e);
                      if (ev.key === "Escape") setEditId(null);
                    }}
                    autoFocus
                    className="field min-w-0 flex-1"
                  />
                  <button onClick={() => saveEventEdit(e)} className="btn-tint flex-none">
                    Save
                  </button>
                </span>
              ) : (
                <>
                  <span className="w-14 flex-none text-[12px] tabular-nums text-ink/50">
                    {e.allDay ? "all-day" : fmtTime(e.startsAt)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px]"
                    style={{ color: eventColor(e, "var(--color-ink)") }}
                    title={e.notes}
                  >
                    {e.title}
                    {e.subLabel && (
                      <span className="ml-2 text-[11px] text-ink/40">
                        {e.subLabel}
                      </span>
                    )}
                  </span>
                </>
              )}
              {e.source === "local" && e.id !== undefined && editId !== e.id && (
                <>
                  <button
                    onClick={() => {
                      setEditId(e.id!);
                      setEditTitle(e.title);
                      setEditTime(e.allDay ? "" : fmtTime(e.startsAt));
                    }}
                    className="h-7 w-6 flex-none text-[12px] text-ink/25 hover:text-accent md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`edit ${e.title}`}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeEvent(e.id!)}
                    className="h-7 w-7 flex-none text-[13px] text-ink/25 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`delete ${e.title}`}
                  >
                    ×
                  </button>
                </>
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
              placeholder="New event"
              className="field min-w-0"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="field max-w-24 flex-none [color-scheme:dark]"
              aria-label="time (empty = all day)"
            />
            <button type="submit" className="btn-tint flex-none">
              Add
            </button>
          </form>
          <p className="text-[11px] text-ink/35">
            Tag !30m / !2h / !1d / !remind for a push before the event
          </p>
        </section>

        {/* upcoming */}
        <section className="glass flex flex-col gap-2 p-4">
          <span className="hud-label">Upcoming</span>
          {upcoming.length === 0 && (
            <p className="py-2 text-[12px] text-ink/40">Nothing scheduled</p>
          )}
          {upcoming.map((e, i) => (
            <button
              key={e.id ?? e.uid ?? i}
              onClick={() => setSelected(dayKey(e.startsAt))}
              className="flex items-baseline gap-2 text-left hover:text-bright"
            >
              <span className="w-24 flex-none text-[12px] tabular-nums text-ink/50">
                {new Date(e.startsAt).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
                {!e.allDay && ` ${fmtTime(e.startsAt)}`}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[13px]"
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
