import type { Feature, Project } from "@/db/schema";

export const PROJECT_STATUS_META: Record<
  Project["status"],
  { label: string; color: string }
> = {
  active: { label: "Active", color: "var(--color-ok)" },
  paused: { label: "Paused", color: "var(--color-warn)" },
  idea: { label: "Idea", color: "var(--color-cyan)" },
  done: { label: "Done", color: "var(--color-accent)" },
  archived: { label: "Archived", color: "var(--color-dim)" },
};

export const FEATURE_STATUS_META: Record<
  Feature["status"],
  { label: string; color: string }
> = {
  planned: { label: "Planned", color: "var(--color-dim)" },
  in_progress: { label: "In progress", color: "var(--color-warn)" },
  built: { label: "Built", color: "var(--color-ok)" },
};

export type StalenessTier = "fresh" | "stale" | "dying";

export function stalenessTier(lastTouched: Date | string): StalenessTier {
  const t = new Date(lastTouched).getTime();
  const days = (Date.now() - t) / 86_400_000;
  if (days < 7) return "fresh";
  if (days <= 21) return "stale";
  return "dying";
}

export const STALENESS_META: Record<
  StalenessTier,
  { color: string; dim: string }
> = {
  fresh: { color: "rgb(235 235 245 / 0.45)", dim: "rgb(235 235 245 / 0.35)" },
  stale: { color: "var(--color-warn)", dim: "rgb(255 159 10 / 0.7)" },
  dying: { color: "var(--color-danger)", dim: "rgb(255 69 58 / 0.8)" },
};

/** "now", "3h", "5d", "8w" — compact relative time. */
export function relTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export function longDate(date: Date | string): string {
  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
