import type { Actor, TicketEventType, TicketStatus } from "@/db/schema";

/**
 * Server-enforced ticket permissions (pure — exhaustively unit-tested).
 *
 *   status                                          human  orchestrator  code/visual
 *   triage                                          yes    yes           create only
 *   queued, in_progress, blocked_on_question,
 *   paused, gate_running, ready_for_review,
 *   done, failed                                    yes    yes           no
 *   changes_requested, approved, cancelled          yes    no            no
 */

export const HUMAN_ONLY_STATUSES: readonly TicketStatus[] = [
  "changes_requested",
  "approved",
  "cancelled",
];

const AGENT_EVENT_TYPES: readonly TicketEventType[] = ["comment", "question", "handoff"];

const HUMAN_ONLY_EVENT_TYPES: readonly TicketEventType[] = ["approval", "rejection"];

export type StatusOp = "create" | "update";

/** May `actor` put a ticket into `status` (on create, or via PATCH)? */
export function canSetStatus(actor: Actor, status: TicketStatus, op: StatusOp): boolean {
  switch (actor) {
    case "human":
      return true;
    case "orchestrator":
      return !HUMAN_ONLY_STATUSES.includes(status);
    case "code":
    case "visual":
      return op === "create" && status === "triage";
  }
}

/** Agents may not PATCH tickets at all — only the orchestrator and the owner. */
export function canPatchTickets(actor: Actor): boolean {
  return actor === "human" || actor === "orchestrator";
}

export function canAddEvent(actor: Actor, type: TicketEventType): boolean {
  switch (actor) {
    case "human":
      return true;
    case "orchestrator":
      return !HUMAN_ONLY_EVENT_TYPES.includes(type);
    case "code":
    case "visual":
      return AGENT_EVENT_TYPES.includes(type);
  }
}

export function forbiddenStatusMessage(actor: Actor, status: TicketStatus): string {
  return `forbidden: ${actor} may not set status ${status}`;
}
