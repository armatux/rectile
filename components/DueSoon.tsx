import Link from "next/link";
import type { ReminderWithProject } from "@/lib/repo";

function fmt(d: Date): string {
  const date = d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return time === "00:00" ? date : `${date} ${time}`;
}

/** Dashboard widget: overdue + next-7-days reminders, worst first. */
export function DueSoon({ items }: { items: ReminderWithProject[] }) {
  if (!items.length) return null;
  const now = Date.now();
  return (
    <div className="hud-panel flex flex-col gap-1 p-4">
      {items.map((r) => {
        const overdue = r.dueAt !== null && r.dueAt.getTime() < now;
        return (
          <Link
            key={r.id}
            href="/reminders"
            className="group flex min-h-[36px] items-center gap-3"
          >
            <span
              className="w-24 flex-none text-[9.5px] font-bold tracking-[0.08em] tabular-nums sm:w-28"
              style={{
                color: overdue ? "var(--color-danger)" : "var(--color-accent)",
              }}
            >
              {overdue && "⚠ "}
              {r.dueAt ? fmt(r.dueAt) : ""}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink group-hover:text-bright">
              {r.title}
              {r.repeat && <span className="ml-2 text-[9px] text-cyan/70">↻</span>}
            </span>
            {r.projectSlug && (
              <span className="hidden flex-none text-[9px] font-bold tracking-[0.12em] text-accent/60 sm:block">
                #{r.projectSlug}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
