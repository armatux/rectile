"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseReminderText } from "@/lib/nl";
import { submitOp } from "@/lib/offline/queue";
import { repeatLabel } from "@/lib/recur";
import { PushToggle } from "./PushToggle";

export type Rem = {
  id: number;
  title: string;
  notes?: string;
  dueAt?: string; // ISO
  repeat?: string;
  projectSlug?: string;
  done: boolean;
};

type Bucket = { key: string; label: string; items: Rem[] };

/** ISO → value for <input type="datetime-local"> in the device's zone */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDue(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return time === "00:00" ? date : `${date} ${time}`;
}

export function RemindersView({
  reminders: serverReminders,
  projects,
  vapidKey,
}: {
  reminders: Rem[];
  projects: { slug: string; name: string }[];
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
  const [patched, setPatched] = useState<Map<number, { title: string; dueAt?: string }>>(
    new Map(),
  );
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");

  function saveEdit(r: Rem) {
    const t = editTitle.trim();
    setEditId(null);
    if (!t) return;
    const dueAt = editDue ? new Date(editDue).toISOString() : undefined;
    setPatched((m) => new Map(m).set(r.id, { title: t, dueAt }));
    startTransition(async () => {
      if (
        await submitOp({
          kind: "reminder.update",
          id: r.id,
          patch: { title: t, dueAt: dueAt ?? null },
        })
      ) {
        router.refresh();
      }
    });
  }

  const slugs = useMemo(() => projects.map((p) => p.slug), [projects]);
  const parsed = useMemo(
    () => (title.trim() ? parseReminderText(title, new Date(), slugs) : null),
    [title, slugs],
  );

  const reminders = useMemo(
    () =>
      [...serverReminders, ...localAdds]
        .filter((r) => !removed.has(r.id))
        .map((r) => (toggled.has(r.id) ? { ...r, done: toggled.get(r.id)! } : r))
        .map((r) => (patched.has(r.id) ? { ...r, ...patched.get(r.id)! } : r)),
    [serverReminders, localAdds, toggled, removed, patched],
  );

  const buckets = useMemo<Bucket[]>(() => {
    const nowISO = new Date().toISOString();
    const todayKey = nowISO.slice(0, 10);
    const open = reminders.filter((r) => !r.done);
    const byDue = (a: Rem, b: Rem) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
    return [
      {
        key: "overdue",
        label: "Overdue",
        items: open.filter((r) => r.dueAt && r.dueAt < nowISO).sort(byDue),
      },
      {
        key: "today",
        label: "Today",
        items: open
          .filter((r) => r.dueAt && r.dueAt >= nowISO && r.dueAt.slice(0, 10) === todayKey)
          .sort(byDue),
      },
      {
        key: "upcoming",
        label: "Upcoming",
        items: open
          .filter((r) => r.dueAt && r.dueAt >= nowISO && r.dueAt.slice(0, 10) > todayKey)
          .sort(byDue),
      },
      { key: "someday", label: "No deadline", items: open.filter((r) => !r.dueAt) },
    ];
  }, [reminders]);

  const doneItems = useMemo(() => reminders.filter((r) => r.done), [reminders]);

  function add() {
    if (!title.trim()) return;
    const p = parseReminderText(title, new Date(), slugs);
    // the manual datetime picker beats the parsed date
    const dueAt = due
      ? new Date(due).toISOString()
      : p.dueAt
        ? p.dueAt.toISOString()
        : undefined;
    const temp: Rem = {
      id: -Date.now(),
      title: p.title,
      dueAt,
      repeat: p.repeat,
      projectSlug: p.projectSlug,
      done: false,
    };
    setLocalAdds((ls) => [...ls, temp]);
    setTitle("");
    setDue("");
    startTransition(async () => {
      if (
        await submitOp({
          kind: "reminder.add",
          title: p.title,
          dueAt,
          repeat: p.repeat,
          projectSlug: p.projectSlug,
          tempId: temp.id,
        })
      ) {
        router.refresh();
        setLocalAdds((ls) => ls.filter((x) => x.id !== temp.id));
      }
    });
  }

  function toggle(r: Rem) {
    const done = !r.done;
    // recurring reminders never park in DONE — the server advances the date
    if (!r.repeat) setToggled((m) => new Map(m).set(r.id, done));
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

  function Row({ r }: { r: Rem }) {
    return (
      <div className="group flex min-h-[48px] items-center gap-3 border-b border-line/60">
        <button
          onClick={() => toggle(r)}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-white/20 text-[12px] text-ink/40 transition-colors hover:border-accent hover:text-accent"
          aria-label={`mark ${r.title} done`}
        >
          {r.repeat ? "↻" : " "}
        </button>
        {editId === r.id ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-1">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit(r);
                if (e.key === "Escape") setEditId(null);
              }}
              autoFocus
              className="field min-w-0 flex-1"
            />
            <input
              type="datetime-local"
              value={editDue}
              onChange={(e) => setEditDue(e.target.value)}
              className="field max-w-[200px] flex-none [color-scheme:dark]"
              aria-label="deadline"
            />
            <button onClick={() => saveEdit(r)} className="btn-tint flex-none">
              Save
            </button>
          </span>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-bright">
                {r.title}
                {r.projectSlug && (
                  <Link
                    href={`/p/${r.projectSlug}`}
                    className="ml-2 text-[11px] font-medium text-accent/70 hover:text-accent"
                  >
                    #{r.projectSlug}
                  </Link>
                )}
              </span>
              {(r.notes || r.repeat) && (
                <span className="block truncate text-[12px] text-ink/45">
                  {r.repeat && (
                    <span className="mr-2 text-cyan/80">{repeatLabel(r.repeat)}</span>
                  )}
                  {r.notes}
                </span>
              )}
            </div>
            {r.dueAt && (
              <span
                className="flex-none text-[12px] font-medium tabular-nums"
                style={{ color: dueColor(r, nowISO) }}
              >
                {fmtDue(r.dueAt)}
              </span>
            )}
          </>
        )}
        <button
          onClick={() => {
            setEditId(r.id);
            setEditTitle(r.title);
            setEditDue(r.dueAt ? toLocalInput(r.dueAt) : "");
          }}
          className="h-8 w-7 flex-none text-[12px] text-ink/25 hover:text-accent md:opacity-0 md:group-hover:opacity-100"
          aria-label={`edit ${r.title}`}
        >
          ✎
        </button>
        <button
          onClick={() => remove(r.id)}
          className="h-8 w-8 flex-none text-[13px] text-ink/25 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
          aria-label={`delete ${r.title}`}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <section className="glass flex flex-col gap-3 p-4">
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
            placeholder="New reminder — try: pay rent friday 18:00 every month #slug"
            className="field min-w-0 flex-1"
          />
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="field max-w-[200px] flex-none [color-scheme:dark]"
            aria-label="deadline (optional, overrides parsed)"
          />
          <button type="submit" className="btn-tint flex-none">
            Add
          </button>
        </form>
        {/* live parse preview */}
        {parsed && (parsed.dueAt || parsed.repeat || parsed.projectSlug) && !due && (
          <p className="-mt-1 text-[12px] text-ink/50">
            <span className="text-accent">→ </span>
            {parsed.title}
            {parsed.dueAt && (
              <span className="ml-2 text-bright">{fmtDue(parsed.dueAt.toISOString())}</span>
            )}
            {parsed.repeat && (
              <span className="ml-2 text-cyan/80">{repeatLabel(parsed.repeat)}</span>
            )}
            {parsed.projectSlug && (
              <span className="ml-2 text-accent/80">#{parsed.projectSlug}</span>
            )}
          </p>
        )}

        {/* open buckets */}
        {buckets.every((b) => b.items.length === 0) && (
          <p className="py-6 text-center text-[12px] text-ink/40">
            Nothing pending — add one above
          </p>
        )}
        {buckets.map(
          (b) =>
            b.items.length > 0 && (
              <div key={b.key} className="flex flex-col">
                <span
                  className="hud-label pt-2"
                  style={b.key === "overdue" ? { color: "var(--color-danger)" } : undefined}
                >
                  {b.label} · {b.items.length}
                </span>
                {b.items.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </div>
            ),
        )}

        {/* done */}
        {doneItems.length > 0 && (
          <div className="flex flex-col">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="pt-2 text-left text-[11px] font-semibold text-ink/45 hover:text-accent"
            >
              {showDone ? "Hide" : "Show"} done · {doneItems.length}
            </button>
            {showDone &&
              doneItems.map((r) => (
                <div
                  key={r.id}
                  className="group flex min-h-[44px] items-center gap-3 border-b border-line/40 opacity-50"
                >
                  <button
                    onClick={() => toggle(r)}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-accent/50 text-[12px] text-accent"
                    aria-label={`mark ${r.title} not done`}
                  >
                    ✓
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink line-through">
                    {r.title}
                  </span>
                  <button
                    onClick={() => remove(r.id)}
                    className="h-8 w-8 flex-none text-[13px] text-ink/25 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
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
      <section className="glass flex h-fit flex-col gap-3 p-4">
        <span className="hud-label">Deadline alerts</span>
        <p className="text-[12px] leading-relaxed text-ink/50">
          Reminders with a deadline fire a push notification on every device
          that has alerts enabled — including iPhone/iPad (iOS 16.4+; add the
          app to the home screen first). Android and desktop notifications
          carry +1h / tomorrow snooze buttons. A daily brief lands at 08:00.
        </p>
        <PushToggle vapidKey={vapidKey} />
        <span className="hud-label pt-2">Quick-add syntax</span>
        <p className="text-[12px] leading-relaxed text-ink/40">
          Dates: tomorrow · friday · 15.9. · 2026-08-01 · in 3 days · tonight
          <br />
          Times: 18:00 · 6pm · 8 uhr — repeat: every monday · daily · monthly
          <br />
          Project: #slug — German works too (morgen, jeden montag, täglich)
        </p>
      </section>
    </div>
  );
}
