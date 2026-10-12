import type { Feature, Project, Tag, TicketStatus } from "@/db/schema";
import {
  FEATURE_STATUS_META,
  PROJECT_STATUS_META,
  relTime,
  STALENESS_META,
  stalenessTier,
  TICKET_STATUS_META,
} from "@/lib/ui";

export function SectionHeader({
  label,
  sub,
}: {
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="hud-label">{label}</span>
      {sub && <span className="hud-sublabel">{sub}</span>}
      <div className="hud-rule" />
    </div>
  );
}

export function StatusBadge({ status }: { status: Project["status"] }) {
  const meta = PROJECT_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 border border-line px-2 py-0.5 text-[9px] font-semibold tracking-[0.2em]"
      style={{ color: meta.color }}
    >
      <span
        className="h-1 w-1 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}` }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const meta = TICKET_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 border border-line px-2 py-0.5 text-[9px] font-semibold tracking-[0.2em]"
      style={{ color: meta.color }}
    >
      <span
        className="h-1 w-1 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}` }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

export function FeatureStatusDot({ status }: { status: Feature["status"] }) {
  const meta = FEATURE_STATUS_META[status];
  return (
    <span
      className="inline-block h-1.5 w-1.5 flex-none rounded-full"
      style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}` }}
      aria-label={meta.label}
    />
  );
}

export function TagChip({ tag }: { tag: Pick<Tag, "name" | "color"> }) {
  return (
    <span className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-ink/70">
      <span
        className="h-1 w-1 rounded-full"
        style={{ background: tag.color }}
        aria-hidden
      />
      {tag.name.toUpperCase()}
    </span>
  );
}

export function PriorityMark({ priority }: { priority: number }) {
  const color =
    priority === 1
      ? "var(--color-accent)"
      : priority === 2
        ? "rgb(217 210 236 / 0.55)"
        : "rgb(217 210 236 / 0.3)";
  return (
    <span
      className="text-[9px] font-bold tracking-[0.2em]"
      style={{ color }}
      title={`priority ${priority}`}
    >
      P{priority}
    </span>
  );
}

export function ProgressBar({
  built,
  total,
  height = 3,
}: {
  built: number;
  total: number;
  height?: number;
}) {
  const pct = total > 0 ? Math.round((built / total) * 100) : 0;
  return (
    <div
      className="w-full bg-white/5"
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background:
            "linear-gradient(90deg, rgb(150 110 255 / 0.7), var(--color-accent))",
          boxShadow: "0 0 8px rgb(150 110 255 / 0.6)",
        }}
      />
    </div>
  );
}

/** Relative last-touched time that visually decays: subtle → amber → red. */
export function Staleness({
  lastTouchedAt,
  withLabel = false,
}: {
  lastTouchedAt: Date | string;
  withLabel?: boolean;
}) {
  const tier = stalenessTier(lastTouchedAt);
  const meta = STALENESS_META[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.12em]"
      style={{ color: meta.color }}
      title={new Date(lastTouchedAt).toLocaleString()}
    >
      <span
        className={`h-1 w-1 rounded-full ${tier === "dying" ? "pulse-dot" : ""}`}
        style={{
          background: meta.color,
          boxShadow: tier !== "fresh" ? `0 0 6px ${meta.color}` : "none",
        }}
        aria-hidden
      />
      {relTime(lastTouchedAt)}
      {withLabel && tier !== "fresh" && (
        <span className="text-[8px] tracking-[0.2em] opacity-80">
          {tier === "stale" ? "STALE" : "DYING"}
        </span>
      )}
    </span>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const pts = values
    .map(
      (v, i) =>
        `${((i * 100) / (values.length - 1)).toFixed(1)},${(
          18 -
          (v / max) * 16
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className="block h-5 w-full"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="rgb(179 156 245 / 0.75)"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
