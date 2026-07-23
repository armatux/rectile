import Link from "next/link";
import { FeatureStatusDot, SectionHeader } from "@/components/hud";
import { getWeeklyReview } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata = { title: "review" };

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Monday 00:00 UTC of the week `offset` weeks before the current one. */
function weekStart(offset: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - offset * 7);
  return d;
}

function fmtDay(d: Date): string {
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    .toUpperCase();
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="hud-panel flex flex-col items-center gap-1 p-4">
      <span
        className="font-display text-[30px] font-bold leading-none"
        style={{ color: color ?? "var(--color-bright)" }}
      >
        {value}
      </span>
      <span className="hud-sublabel">{label}</span>
    </div>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const w = Math.max(0, Number(typeof sp.w === "string" ? sp.w : 0) || 0);
  const start = weekStart(w);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const r = await getWeeklyReview(start, end);

  const shippedByProject = new Map<string, { name: string; titles: string[] }>();
  for (const f of r.shipped) {
    const e = shippedByProject.get(f.projectSlug) ?? { name: f.projectName, titles: [] };
    e.titles.push(f.title);
    shippedByProject.set(f.projectSlug, e);
  }
  const maxLogs = Math.max(1, ...r.logCounts.map((l) => l.count));

  return (
    <div className="flex flex-col gap-5 pt-5">
      <div className="flex items-center gap-3">
        <SectionHeader
          label="WEEKLY REVIEW"
          sub={`${fmtDay(start)} → ${fmtDay(new Date(end.getTime() - 86_400_000))}${w ? ` · ${w}W AGO` : " · THIS WEEK"}`}
        />
        <span className="ml-auto flex gap-1">
          <Link
            href={`/review?w=${w + 1}`}
            className="flex h-9 w-9 items-center justify-center border border-line text-ink/50 hover:border-line-strong hover:text-accent"
            aria-label="previous week"
          >
            ◂
          </Link>
          <Link
            href={w > 1 ? `/review?w=${w - 1}` : "/review"}
            className={`flex h-9 w-9 items-center justify-center border border-line text-ink/50 hover:border-line-strong hover:text-accent ${w === 0 ? "pointer-events-none opacity-30" : ""}`}
            aria-label="next week"
          >
            ▸
          </Link>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat value={String(r.shipped.length)} label="FEATURES SHIPPED" color="var(--color-ok)" />
        <Stat value={String(r.remindersDone.length)} label="REMINDERS DONE" />
        <Stat
          value={String(r.logCounts.reduce((a, l) => a + l.count, 0))}
          label="LOG ENTRIES"
        />
        <Stat value={`${r.activeDays.length}/7`} label="ACTIVE DAYS" />
        <Stat
          value={`${r.streak}D`}
          label="STREAK"
          color={r.streak > 0 ? "var(--color-accent)" : "var(--color-dim)"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="hud-panel flex flex-col gap-2 p-4">
          <span className="hud-sublabel">SHIPPED</span>
          {r.shipped.length === 0 && (
            <p className="py-3 text-[10px] tracking-[0.16em] text-ink/30">
              NOTHING SHIPPED THIS WEEK
            </p>
          )}
          {[...shippedByProject.entries()].map(([slug, e]) => (
            <div key={slug} className="flex flex-col gap-1">
              <Link
                href={`/p/${slug}`}
                className="text-[11px] font-bold tracking-[0.08em] text-bright hover:text-accent"
              >
                {e.name}
              </Link>
              {e.titles.map((t, i) => (
                <span key={i} className="flex items-center gap-2 pl-2 text-[11px] text-ink/70">
                  <FeatureStatusDot status="built" />
                  {t}
                </span>
              ))}
            </div>
          ))}
          {r.remindersDone.length > 0 && (
            <>
              <span className="hud-sublabel pt-2">REMINDERS CLEARED</span>
              {r.remindersDone.map((rem) => (
                <span key={rem.id} className="pl-2 text-[11px] text-ink/60 line-through">
                  {rem.title}
                </span>
              ))}
            </>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="hud-panel flex flex-col gap-2 p-4">
            <span className="hud-sublabel">LOG ACTIVITY</span>
            {r.logCounts.length === 0 && (
              <p className="py-3 text-[10px] tracking-[0.16em] text-ink/30">NO LOGS</p>
            )}
            {r.logCounts.map((l) => (
              <Link
                key={l.projectSlug}
                href={`/p/${l.projectSlug}`}
                className="group flex items-center gap-2"
              >
                <span className="w-28 flex-none truncate text-[10.5px] text-ink group-hover:text-bright sm:w-36">
                  {l.projectName}
                </span>
                <span className="h-2 flex-1 bg-panel">
                  <span
                    className="block h-full bg-accent/60"
                    style={{ width: `${(l.count / maxLogs) * 100}%` }}
                  />
                </span>
                <span className="w-6 flex-none text-right text-[10px] tabular-nums text-ink/50">
                  {l.count}
                </span>
              </Link>
            ))}
          </section>

          <section className="hud-panel flex flex-col gap-2 p-4">
            <span className="hud-sublabel" style={{ color: "var(--color-warn)" }}>
              WENT STALE THIS WEEK
            </span>
            {r.wentStale.length === 0 && (
              <p className="py-3 text-[10px] tracking-[0.16em] text-ink/30">
                NOTHING NEW WENT STALE
              </p>
            )}
            {r.wentStale.map((p) => {
              const days = Math.floor(
                (Date.now() - p.lastTouchedAt.getTime()) / 86_400_000,
              );
              return (
                <Link
                  key={p.slug}
                  href={`/p/${p.slug}`}
                  className="flex items-center gap-2 text-[11px] text-ink hover:text-bright"
                >
                  <span
                    className="w-10 flex-none text-right font-display text-[16px] font-bold"
                    style={{ color: "var(--color-warn)" }}
                  >
                    {days}
                    <span className="text-[9px]">D</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </Link>
              );
            })}
            <p className="pt-1 text-[9px] tracking-[0.12em] text-ink/30">
              EVENTS THIS WEEK · {r.eventsCount} — full radar on{" "}
              <Link href="/stale" className="text-accent/70 hover:text-accent">
                /STALE
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
