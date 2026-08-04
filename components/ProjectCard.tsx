import Link from "next/link";
import type { ProjectSummary } from "@/lib/repo";
import {
  PriorityMark,
  ProgressBar,
  Staleness,
  StatusBadge,
  TagChip,
} from "./hud";

export function ProjectCard({ project: p }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/p/${p.slug}`}
      className="hud-panel fade-in group flex min-h-[44px] flex-col gap-3 p-4 transition-colors hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-bright group-hover:text-accent">
            {p.name}
          </h2>
          {p.category && (
            <span className="hud-sublabel">{p.category}</span>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          <PriorityMark priority={p.priority} />
          <StatusBadge status={p.status} />
        </div>
      </div>

      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-ink/50">
            <span className="text-[13px] font-semibold text-bright">
              {p.featuresBuilt}
            </span>
            {" / "}
            {p.featuresTotal} built
          </span>
          <Staleness lastTouchedAt={p.lastTouchedAt} withLabel />
        </div>
        <ProgressBar built={p.featuresBuilt} total={p.featuresTotal} />
      </div>

      <div className="truncate text-[12px] text-ink/60">
        <span className="text-accent">Next · </span>
        {p.nextAction ?? "no roadmap items yet"}
      </div>
    </Link>
  );
}
