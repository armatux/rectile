import type { Actor, Feature, Project, TicketStatus } from "@/db/schema";

export const PROJECT_STATUS_META: Record<
  Project["status"],
  { label: string; color: string }
> = {
  active: { label: "ACTIVE", color: "var(--color-ok)" },
  paused: { label: "PAUSED", color: "var(--color-warn)" },
  idea: { label: "IDEA", color: "var(--color-cyan)" },
  done: { label: "DONE", color: "var(--color-accent)" },
  archived: { label: "ARCHIVED", color: "var(--color-dim)" },
};

export const FEATURE_STATUS_META: Record<
  Feature["status"],
  { label: string; color: string }
> = {
  planned: { label: "PLANNED", color: "var(--color-dim)" },
  in_progress: { label: "IN PROGRESS", color: "var(--color-warn)" },
  built: { label: "BUILT", color: "var(--color-ok)" },
};

export const TICKET_STATUS_META: Record<
  TicketStatus,
  { label: string; color: string }
> = {
  triage: { label: "TRIAGE", color: "var(--color-dim)" },
  queued: { label: "QUEUED", color: "var(--color-cyan)" },
  in_progress: { label: "IN PROGRESS", color: "var(--color-warn)" },
  blocked_on_question: { label: "BLOCKED · QUESTION", color: "var(--color-danger)" },
  paused: { label: "PAUSED", color: "var(--color-dim)" },
  gate_running: { label: "GATE RUNNING", color: "var(--color-warn)" },
  ready_for_review: { label: "READY FOR REVIEW", color: "var(--color-accent)" },
  changes_requested: { label: "CHANGES REQUESTED", color: "var(--color-danger)" },
  approved: { label: "APPROVED", color: "var(--color-ok)" },
  done: { label: "DONE", color: "var(--color-ok)" },
  failed: { label: "FAILED", color: "var(--color-danger)" },
  cancelled: { label: "CANCELLED", color: "var(--color-dim)" },
};

/** Board order: what needs the owner first, finished work last. */
export const TICKET_STATUS_ORDER: TicketStatus[] = [
  "ready_for_review",
  "blocked_on_question",
  "failed",
  "changes_requested",
  "gate_running",
  "in_progress",
  "queued",
  "triage",
  "paused",
  "approved",
  "done",
  "cancelled",
];

export const ACTOR_COLOR: Record<Actor, string> = {
  human: "var(--color-accent)",
  orchestrator: "var(--color-cyan)",
  code: "var(--color-ok)",
  visual: "var(--color-warn)",
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
  fresh: { color: "rgb(217 210 236 / 0.45)", dim: "rgb(217 210 236 / 0.35)" },
  stale: { color: "var(--color-warn)", dim: "rgb(229 192 123 / 0.7)" },
  dying: { color: "var(--color-danger)", dim: "rgb(224 108 117 / 0.8)" },
};

/** "now", "3h", "5d", "8w" — HUD-style compact relative time. */
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
