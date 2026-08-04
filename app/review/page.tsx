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
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="glass flex flex-col items-center gap-1 p-4">
      <span
        className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums"
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
          label="Weekly review"
          sub={`${fmtDay(start)} → ${fmtDay(new Date(end.getTime() - 86_400_000))}${w ? ` · ${w}w ago` : " · this week"}`}
        />
        <span className="ml-auto flex gap-1.5">
          <Link
            href={`/review?w=${w + 1}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/[0.04] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright"
            aria-label="previous week"
          >
            ‹
          </Link>
          <Link
            href={w > 1 ? `/review?w=${w - 1}` : "/review"}
            className={`flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/[0.04] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright ${w === 0 ? "pointer-events-none opacity-30" : ""}`}
            aria-label="next week"
          >
            ›
          </Link>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat value={String(r.shipped.length)} label="Features shipped" color="var(--color-ok)" />
        <Stat value={String(r.remindersDone.length)} label="Reminders done" />
        <Stat
          value={String(r.logCounts.reduce((a, l) => a + l.count, 0))}
          label="Log entries"
        />
        <Stat value={`${r.activeDays.length}/7`} label="Active days" />
        <Stat
          value={`${r.streak}d`}
          label="Streak"
          color={r.streak > 0 ? "var(--color-accent)" : "var(--color-dim)"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="glass flex flex-col gap-2 p-4">
          <span className="hud-label">Shipped</span>
          {r.shipped.length === 0 && (
            <p className="py-3 text-[12px] text-ink/40">
              Nothing shipped this week.
            </p>
          )}
          {[...shippedByProject.entries()].map(([slug, e]) => (
            <div key={slug} className="flex flex-col gap-1">
              <Link
                href={`/p/${slug}`}
                className="text-[13px] font-semibold text-bright hover:text-accent"
              >
                {e.name}
              </Link>
              {e.titles.map((t, i) => (
                <span key={i} className="flex items-center gap-2 pl-2 text-[12px] text-ink/70">
                  <FeatureStatusDot status="built" />
                  {t}
                </span>
              ))}
            </div>
          ))}
          {r.remindersDone.length > 0 && (
            <>
              <span className="hud-label pt-2">Reminders cleared</span>
              {r.remindersDone.map((rem) => (
                <span key={rem.id} className="pl-2 text-[12px] text-ink/60 line-through">
                  {rem.title}
                </span>
              ))}
            </>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="glass flex flex-col gap-2 p-4">
            <span className="hud-label">Log activity</span>
            {r.logCounts.length === 0 && (
              <p className="py-3 text-[12px] text-ink/40">No log entries.</p>
            )}
            {r.logCounts.map((l) => (
              <Link
                key={l.projectSlug}
                href={`/p/${l.projectSlug}`}
                className="group flex items-center gap-2"
              >
                <span className="w-28 flex-none truncate text-[12px] text-ink group-hover:text-bright sm:w-36">
                  {l.projectName}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(l.count / maxLogs) * 100}%` }}
                  />
                </span>
                <span className="w-6 flex-none text-right text-[11px] tabular-nums text-ink/50">
                  {l.count}
                </span>
              </Link>
            ))}
          </section>

          <section className="glass flex flex-col gap-2 p-4">
            <span className="hud-label" style={{ color: "var(--color-warn)" }}>
              Went stale this week
            </span>
            {r.wentStale.length === 0 && (
              <p className="py-3 text-[12px] text-ink/40">
                Nothing new went stale.
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
                  className="flex items-center gap-2 text-[12px] text-ink hover:text-bright"
                >
                  <span
                    className="w-10 flex-none text-right font-display text-[15px] font-semibold tabular-nums"
                    style={{ color: "var(--color-warn)" }}
                  >
                    {days}
                    <span className="text-[11px] font-medium">d</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </Link>
              );
            })}
            <p className="pt-1 text-[11px] text-ink/40">
              {r.eventsCount} events this week — full list in{" "}
              <Link href="/stale" className="text-accent hover:text-[#409cff]">
                Stale projects
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
