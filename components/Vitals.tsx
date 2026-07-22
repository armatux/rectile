import type { Vitals } from "@/lib/repo";
import { Sparkline } from "./hud";

function Stat({
  label,
  value,
  note,
  noteColor,
  spark,
}: {
  label: string;
  value: string;
  note?: string;
  noteColor?: string;
  spark?: number[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span
          className="h-[5px] w-[5px] flex-none self-center rounded-full bg-accent"
          style={{ boxShadow: "0 0 6px var(--color-accent)" }}
          aria-hidden
        />
        <span className="flex-1 truncate text-[9px] font-medium tracking-[0.2em] text-ink/60">
          {label}
        </span>
        {note && (
          <span
            className="hidden truncate text-[9px] font-semibold tracking-[0.08em] sm:inline"
            style={{ color: noteColor ?? "rgb(217 210 236 / 0.4)" }}
          >
            {note}
          </span>
        )}
      </div>
      <span className="font-display text-[30px] font-bold leading-none tracking-[0.02em] text-bright sm:text-[34px]">
        {value}
      </span>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

export function VitalsBar({ vitals }: { vitals: Vitals }) {
  return (
    <section aria-label="system vitals" className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
      <Stat
        label="ACTIVE PROJECTS"
        value={String(vitals.activeProjects)}
        note="LOG ACTIVITY · 14D"
        spark={vitals.activity}
      />
      <Stat label="AVG PROGRESS" value={`${vitals.avgProgress}%`} note="FEATURES BUILT" />
      <Stat
        label="NEEDS ATTENTION"
        value={String(vitals.hotCount)}
        note="IDLE ≥ 7D"
        noteColor={vitals.hotCount > 0 ? "var(--color-warn)" : undefined}
      />
      <Stat
        label="LONGEST IDLE"
        value={`${vitals.longestIdleDays}D`}
        note={vitals.longestIdleName?.toUpperCase()}
        noteColor="rgb(217 210 236 / 0.4)"
      />
    </section>
  );
}
