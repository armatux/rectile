import { describe, expect, it } from "vitest";
import {
  ACTORS,
  TICKET_EVENT_TYPES,
  TICKET_STATUSES,
  type Actor,
  type TicketEventType,
  type TicketStatus,
} from "@/db/schema";
import {
  canAddEvent,
  canPatchTickets,
  canSetStatus,
  forbiddenStatusMessage,
} from "@/lib/ticketGuard";

/* The contract's table, written out literally: [create, update] per actor.
   Any drift between this and lib/ticketGuard.ts fails a cell below. */
const Y = [true, true] as const;
const N = [false, false] as const;
const CREATE_ONLY = [true, false] as const;

const STATUS_MATRIX: Record<TicketStatus, Record<Actor, readonly [boolean, boolean]>> = {
  triage: { human: Y, orchestrator: Y, code: CREATE_ONLY, visual: CREATE_ONLY },
  queued: { human: Y, orchestrator: Y, code: N, visual: N },
  in_progress: { human: Y, orchestrator: Y, code: N, visual: N },
  blocked_on_question: { human: Y, orchestrator: Y, code: N, visual: N },
  gate_running: { human: Y, orchestrator: Y, code: N, visual: N },
  ready_for_review: { human: Y, orchestrator: Y, code: N, visual: N },
  done: { human: Y, orchestrator: Y, code: N, visual: N },
  failed: { human: Y, orchestrator: Y, code: N, visual: N },
  paused: { human: Y, orchestrator: Y, code: N, visual: N },
  changes_requested: { human: Y, orchestrator: N, code: N, visual: N },
  approved: { human: Y, orchestrator: N, code: N, visual: N },
  cancelled: { human: Y, orchestrator: N, code: N, visual: N },
};

const AGENT_EVENTS: TicketEventType[] = ["comment", "question", "handoff"];
const HUMAN_ONLY_EVENTS: TicketEventType[] = ["approval", "rejection"];

describe("ticket status guard", () => {
  it("covers every status in the enum", () => {
    expect(Object.keys(STATUS_MATRIX).sort()).toEqual([...TICKET_STATUSES].sort());
  });

  for (const status of TICKET_STATUSES) {
    for (const actor of ACTORS) {
      const [onCreate, onUpdate] = STATUS_MATRIX[status][actor];
      it(`${actor} → ${status}: create ${onCreate ? "yes" : "no"}, update ${onUpdate ? "yes" : "no"}`, () => {
        expect(canSetStatus(actor, status, "create")).toBe(onCreate);
        expect(canSetStatus(actor, status, "update")).toBe(onUpdate);
      });
    }
  }

  it("only the owner and the orchestrator may patch tickets", () => {
    expect(ACTORS.filter(canPatchTickets).sort()).toEqual(["human", "orchestrator"]);
  });

  it("formats the contract's 403 message", () => {
    expect(forbiddenStatusMessage("code", "approved")).toBe(
      "forbidden: code may not set status approved",
    );
  });
});

describe("ticket event guard", () => {
  for (const type of TICKET_EVENT_TYPES) {
    it(`${type}`, () => {
      expect(canAddEvent("human", type)).toBe(true);
      expect(canAddEvent("orchestrator", type)).toBe(!HUMAN_ONLY_EVENTS.includes(type));
      expect(canAddEvent("code", type)).toBe(AGENT_EVENTS.includes(type));
      expect(canAddEvent("visual", type)).toBe(AGENT_EVENTS.includes(type));
    });
  }
});
