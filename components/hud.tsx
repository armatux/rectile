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
    <div className="flex items-baseline gap-2">
      <span className="hud-label">{label}</span>
      {sub && <span className="hud-sublabel">{sub}</span>}
      <div className="hud-rule self-center" />
    </div>
  );
}

export function StatusBadge({ status }: { status: Project["status"] }) {
  const meta = PROJECT_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium"
      style={{ color: meta.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color }}
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
      style={{ background: meta.color }}
      aria-label={meta.label}
    />
  );
}

export function TagChip({ tag }: { tag: Pick<Tag, "name" | "color"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-ink/75">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: tag.color }}
        aria-hidden
      />
      {tag.name}
    </span>
  );
}

export function PriorityMark({ priority }: { priority: number }) {
  const color =
    priority === 1
      ? "var(--color-accent)"
      : priority === 2
        ? "rgb(235 235 245 / 0.55)"
        : "rgb(235 235 245 / 0.3)";
  return (
    <span
      className="text-[11px] font-semibold"
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
  height = 4,
}: {
  built: number;
  total: number;
  height?: number;
}) {
  const pct = total > 0 ? Math.round((built / total) * 100) : 0;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-white/10"
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Relative last-touched time that visually decays: subtle → orange → red. */
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
      className="inline-flex items-center gap-1.5 text-[12px]"
      style={{ color: meta.color }}
      title={new Date(lastTouchedAt).toLocaleString()}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${tier === "dying" ? "pulse-dot" : ""}`}
        style={{ background: meta.color }}
        aria-hidden
      />
      {relTime(lastTouchedAt)}
      {withLabel && tier !== "fresh" && (
        <span className="text-[11px] font-medium opacity-80">
          {tier === "stale" ? "stale" : "dying"}
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
        stroke="rgb(10 132 255 / 0.8)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
