"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";
import { PushToggle } from "./PushToggle";

export type Rem = {
  id: number;
  title: string;
  notes?: string;
  dueAt?: string; // ISO
  done: boolean;
};

type Bucket = { key: string; label: string; items: Rem[] };

function fmtDue(iso: string): string {
  const d = new Date(iso);
  const date = d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return time === "00:00" ? date : `${date} ${time}`;
}

export function RemindersView({
  reminders: serverReminders,
  vapidKey,
}: {
  reminders: Rem[];
  vapidKey: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localAdds, setLocalAdds] = useState<Rem[]>([]);
  const [toggled, setToggled] = useState<Map<number, boolean>>(new Map());
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const reminders = useMemo(
    () =>
      [...serverReminders, ...localAdds]
        .filter((r) => !removed.has(r.id))
        .map((r) => (toggled.has(r.id) ? { ...r, done: toggled.get(r.id)! } : r)),
    [serverReminders, localAdds, toggled, removed],
  );

  const buckets = useMemo<Bucket[]>(() => {
    const nowISO = new Date().toISOString();
    const todayKey = nowISO.slice(0, 10);
    const open = reminders.filter((r) => !r.done);
    const byDue = (a: Rem, b: Rem) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
    return [
      {
        key: "overdue",
        label: "OVERDUE",
        items: open.filter((r) => r.dueAt && r.dueAt < nowISO).sort(byDue),
      },
      {
        key: "today",
        label: "TODAY",
        items: open
          .filter((r) => r.dueAt && r.dueAt >= nowISO && r.dueAt.slice(0, 10) === todayKey)
          .sort(byDue),
      },
      {
        key: "upcoming",
        label: "UPCOMING",
        items: open
          .filter((r) => r.dueAt && r.dueAt >= nowISO && r.dueAt.slice(0, 10) > todayKey)
          .sort(byDue),
      },
      { key: "someday", label: "NO DEADLINE", items: open.filter((r) => !r.dueAt) },
    ];
  }, [reminders]);

  const doneItems = useMemo(() => reminders.filter((r) => r.done), [reminders]);

  function add() {
    const t = title.trim();
    if (!t) return;
    const dueAt = due ? new Date(due).toISOString() : undefined;
    const temp: Rem = { id: -Date.now(), title: t, dueAt, done: false };
    setLocalAdds((ls) => [...ls, temp]);
    setTitle("");
    setDue("");
    startTransition(async () => {
      if (
        await submitOp({ kind: "reminder.add", title: t, dueAt, tempId: temp.id })
      ) {
        router.refresh();
        setLocalAdds((ls) => ls.filter((x) => x.id !== temp.id));
      }
    });
  }

  function toggle(r: Rem) {
    const done = !r.done;
    setToggled((m) => new Map(m).set(r.id, done));
    startTransition(async () => {
      if (await submitOp({ kind: "reminder.toggle", id: r.id, done })) {
        router.refresh();
      }
    });
  }

  function remove(id: number) {
    setRemoved((s) => new Set(s).add(id));
    setLocalAdds((ls) => ls.filter((x) => x.id !== id));
    startTransition(async () => {
      if (await submitOp({ kind: "reminder.delete", id })) router.refresh();
    });
  }

  function dueColor(r: Rem, nowISO: string): string {
    if (!r.dueAt) return "var(--color-ink)";
    if (r.dueAt < nowISO) return "var(--color-danger)";
    if (r.dueAt.slice(0, 10) === nowISO.slice(0, 10)) return "var(--color-accent)";
    return "var(--color-ink)";
  }

  const nowISO = new Date().toISOString();

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <section className="hud-panel flex flex-col gap-3 p-4">
        {/* quick add */}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="+ reminder"
            className="min-h-[42px] w-full min-w-0 flex-1 border border-line bg-panel/70 px-2.5 text-[11.5px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none sm:w-auto"
          />
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="min-h-[42px] flex-none border border-line bg-panel/70 px-2 text-[11px] text-bright focus:border-line-strong focus:outline-none [color-scheme:dark]"
            aria-label="deadline (optional)"
          />
          <button
            type="submit"
            className="min-h-[42px] flex-none border border-line-strong px-3 text-[9px] font-bold tracking-[0.2em] text-accent hover:bg-accent/10"
          >
            ADD
          </button>
        </form>

        {/* open buckets */}
        {buckets.every((b) => b.items.length === 0) && (
          <p className="py-6 text-center text-[10px] tracking-[0.2em] text-ink/30">
            NOTHING PENDING · ADD ONE ABOVE
          </p>
        )}
        {buckets.map(
          (b) =>
            b.items.length > 0 && (
              <div key={b.key} className="flex flex-col">
                <span
                  className="hud-sublabel pt-2"
                  style={b.key === "overdue" ? { color: "var(--color-danger)" } : undefined}
                >
                  {b.label} · {String(b.items.length).padStart(2, "0")}
                </span>
                {b.items.map((r) => (
                  <div
                    key={r.id}
                    className="group flex min-h-[48px] items-center gap-3 border-b border-line/60"
                  >
                    <button
                      onClick={() => toggle(r)}
                      className="flex h-8 w-8 flex-none items-center justify-center border border-line text-[11px] text-ink/40 transition-colors hover:border-line-strong hover:text-accent"
                      aria-label={`mark ${r.title} done`}
                    >
                      {" "}
                    </button>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-bright">
                        {r.title}
                      </span>
                      {r.notes && (
                        <span className="block truncate text-[10px] text-ink/45">
                          {r.notes}
                        </span>
                      )}
                    </div>
                    {r.dueAt && (
                      <span
                        className="flex-none text-[9.5px] font-bold tracking-[0.08em] tabular-nums"
                        style={{ color: dueColor(r, nowISO) }}
                      >
                        {fmtDue(r.dueAt)}
                      </span>
                    )}
                    <button
                      onClick={() => remove(r.id)}
                      className="h-8 w-8 flex-none text-[12px] text-ink/20 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
                      aria-label={`delete ${r.title}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ),
        )}

        {/* done */}
        {doneItems.length > 0 && (
          <div className="flex flex-col">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="hud-sublabel pt-2 text-left hover:text-accent"
            >
              {showDone ? "▾" : "▸"} DONE · {String(doneItems.length).padStart(2, "0")}
            </button>
            {showDone &&
              doneItems.map((r) => (
                <div
                  key={r.id}
                  className="group flex min-h-[44px] items-center gap-3 border-b border-line/40 opacity-50"
                >
                  <button
                    onClick={() => toggle(r)}
                    className="flex h-8 w-8 flex-none items-center justify-center border border-line text-[11px] text-accent"
                    aria-label={`mark ${r.title} not done`}
                  >
                    ✓
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink line-through">
                    {r.title}
                  </span>
                  <button
                    onClick={() => remove(r.id)}
                    className="h-8 w-8 flex-none text-[12px] text-ink/20 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`delete ${r.title}`}
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* alerts */}
      <section className="hud-panel flex h-fit flex-col gap-3 p-4">
        <span className="hud-sublabel">DEADLINE ALERTS</span>
        <p className="text-[10px] leading-relaxed tracking-[0.06em] text-ink/50">
          reminders with a deadline fire a push notification on every device
          that enabled alerts — including iPhone/iPad (iOS 16.4+, app must be
          added to the home screen first).
        </p>
        <PushToggle vapidKey={vapidKey} />
      </section>
    </div>
  );
}
