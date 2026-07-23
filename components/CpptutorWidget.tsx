import Link from "next/link";
import { ProgressBar } from "./hud";
import type { CpptutorProgress } from "@/lib/cpptutor";
import { relTime } from "@/lib/ui";

export type { CpptutorProgress } from "@/lib/cpptutor";

function MiniBar({
  label,
  right,
  built,
  total,
}: {
  label: string;
  right: string;
  built: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="hud-sublabel">{label}</span>
        <span className="text-[10px] font-semibold tracking-[0.08em] text-ink/70">
          {right}
        </span>
      </div>
      <ProgressBar built={built} total={total} height={4} />
    </div>
  );
}

export function CpptutorWidget({
  data,
  updatedAt,
}: {
  data: CpptutorProgress;
  updatedAt: Date;
}) {
  const levelSpan = Math.max(1, data.xp_level_next - data.xp_level_floor);
  const levelInto = Math.max(0, data.xp_lifetime - data.xp_level_floor);
  const lessonPct = data.total ? ((data.done / data.total) * 100).toFixed(1) : "0";
  const startedTracks = (data.tracks ?? []).filter((t) => t.done > 0);

  return (
    <Link
      href="/cpptutor"
      className="hud-panel group flex flex-col gap-4 p-4 transition-colors hover:border-line-strong"
    >
      <div className="grid grid-cols-1 items-center gap-x-8 gap-y-4 lg:grid-cols-[auto_1fr_1fr]">
        {/* level identity */}
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-[40px] font-bold leading-none text-bright"
            style={{ textShadow: "0 0 30px rgb(150 110 255 / 0.45)" }}
          >
            L{data.level}
            {data.prestige > 0 && (
              <span className="ml-1 text-[16px] text-accent">✦{data.prestige}</span>
            )}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold tracking-[0.24em] text-accent">
              {data.title.toUpperCase()}
            </span>
            <span className="text-[9.5px] tracking-[0.14em] text-ink/50">
              {data.xp} XP{data.streak > 0 && ` · STREAK ${data.streak}`}
            </span>
          </span>
        </div>

        <MiniBar
          label={`LEVEL ${data.level} → ${data.level + 1}`}
          right={`${levelInto} / ${levelSpan} XP`}
          built={levelInto}
          total={levelSpan}
        />
        <MiniBar
          label="LESSONS"
          right={`${data.done} / ${data.total} · ${lessonPct}%`}
          built={data.done}
          total={data.total}
        />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
        <p className="min-w-0 flex-1 basis-64 truncate text-[11.5px] text-ink">
          <span className="mr-2 text-[9px] font-bold tracking-[0.22em] text-accent">
            NEXT ▸
          </span>
          {data.next_lesson ? (
            <>
              {data.next_lesson}
              <span className="text-ink/45"> · {data.next_module}</span>
            </>
          ) : (
            "ALL LESSONS COMPLETE"
          )}
        </p>
        {startedTracks.length > 0 && (
          <span className="hidden text-[9px] tracking-[0.14em] text-ink/40 md:inline">
            {startedTracks.map((t) => `${t.title.split("—")[0].trim()} ${t.done}/${t.total}`).join(" · ")}
          </span>
        )}
        <span className="hud-sublabel">SYNCED {relTime(updatedAt)}</span>
      </div>
    </Link>
  );
}
