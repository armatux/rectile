import Link from "next/link";
import { SectionHeader, Staleness, StatusBadge } from "@/components/hud";
import { listProjects } from "@/lib/repo";
import { STALENESS_META, stalenessTier } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "stale" };

export default async function StalePage() {
  const all = await listProjects({ sort: "staleness" });
  const tracked = all.filter(
    (p) => p.status !== "done" && p.status !== "archived",
  );

  return (
    <div className="flex flex-col gap-5 pt-5">
      <SectionHeader
        label="STALE RADAR"
        sub={`TRACKED.${String(tracked.length).padStart(2, "0")} · OLDEST FIRST`}
      />
      <p className="-mt-3 text-[10px] tracking-[0.08em] text-ink/40">
        every non-done project, least recently touched first — the top of this
        list is where projects go to die.
      </p>

      <ol className="flex flex-col">
        {tracked.map((p, i) => {
          const tier = stalenessTier(p.lastTouchedAt);
          const days = Math.floor(
            (Date.now() - new Date(p.lastTouchedAt).getTime()) / 86_400_000,
          );
          return (
            <li key={p.id}>
              <Link
                href={`/p/${p.slug}`}
                className="group flex min-h-[64px] items-center gap-4 border-b border-line/60 py-3 transition-colors hover:bg-accent/5"
              >
                <span className="w-7 flex-none text-right text-[10px] text-ink/25">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="w-16 flex-none text-right font-display text-[26px] font-bold leading-none sm:w-20 sm:text-[32px]"
                  style={{ color: STALENESS_META[tier].color }}
                >
                  {days}
                  <span className="text-[11px] font-medium opacity-70">D</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-bold tracking-[0.06em] text-bright group-hover:text-accent">
                      {p.name}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-ink/50">
                    <span className="text-accent/80">next ▸ </span>
                    {p.nextAction ?? "no roadmap items"}
                  </p>
                </div>
                <span className="hidden flex-none sm:block">
                  <Staleness lastTouchedAt={p.lastTouchedAt} withLabel />
                </span>
              </Link>
            </li>
          );
        })}
        {tracked.length === 0 && (
          <p className="py-10 text-center text-[11px] tracking-[0.2em] text-ink/40">
            NOTHING TRACKED · EVERYTHING IS DONE OR ARCHIVED
          </p>
        )}
      </ol>
    </div>
  );
}
