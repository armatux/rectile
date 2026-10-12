"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionCommentTicket, actionDecideTicket } from "@/app/actions";
import type { TicketStatus } from "@/db/schema";
import { isOffline } from "@/lib/offline/queue";
import { TICKET_STATUS_META } from "@/lib/ui";
import { SectionHeader } from "../hud";

/* Ticket writes are online-only on purpose (like erasing a project): a
   queued approval replayed hours later against a moved ticket would be
   worse than a visible "offline" error. */

const OFFLINE = "OFFLINE · TICKET ACTIONS NEED THE SERVER";

/* ------------------------------ comment box ------------------------------ */

export function TicketCommentForm({ ticketKey }: { ticketKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const body = value.trim();
    if (!body || pending) return;
    if (isOffline()) return setError(OFFLINE);
    setError(null);
    startTransition(async () => {
      const res = await actionCommentTicket(ticketKey, body);
      if (res.ok) {
        setValue("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 border border-line bg-panel/70 px-3 focus-within:border-line-strong"
      >
        <span className="text-accent" aria-hidden>
          ▸
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="comment as owner"
          enterKeyHint="send"
          className="min-h-[48px] w-full bg-transparent text-[12px] text-bright placeholder:text-ink/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] flex-none text-[9px] font-bold tracking-[0.2em] text-accent hover:text-bright disabled:opacity-40"
        >
          {pending ? "…" : "SEND"}
        </button>
      </form>
      {error && <p className="text-[9.5px] tracking-[0.12em] text-danger">{error}</p>}
    </div>
  );
}

/* ---------------------------- owner decisions ---------------------------- */

type Decision = "approved" | "changes_requested" | "cancelled";

const DECISIONS: {
  status: Decision;
  label: string;
  verb: string;
  color: string;
  notePrompt: string;
}[] = [
  {
    status: "approved",
    label: "APPROVE",
    verb: "Approve",
    color: "var(--color-ok)",
    notePrompt: "note for the record (optional)",
  },
  {
    status: "changes_requested",
    label: "REQUEST CHANGES",
    verb: "Request changes on",
    color: "var(--color-warn)",
    notePrompt: "what needs to change?",
  },
  {
    status: "cancelled",
    label: "CANCEL TICKET",
    verb: "Cancel",
    color: "var(--color-danger)",
    notePrompt: "reason (optional)",
  },
];

export function TicketDecisions({
  ticketKey,
  version,
  status,
}: {
  ticketKey: string;
  version: number;
  status: TicketStatus;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<(typeof DECISIONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(d: (typeof DECISIONS)[number]) {
    setChoice(d);
    setNote("");
    setError(null);
    dialog.current?.showModal();
  }

  function confirm() {
    if (!choice || pending) return;
    if (isOffline()) return setError(OFFLINE);
    startTransition(async () => {
      const res = await actionDecideTicket(ticketKey, {
        status: choice.status,
        version,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        dialog.current?.close();
      } else {
        // e.g. a version conflict: show it, and pull the current ticket in
        // behind the dialog so a deliberate second confirm uses it
        setError(res.error);
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader label="DECISION" sub="OWNER.ONLY" />
      <div className="flex flex-col gap-2">
        {DECISIONS.map((d) => (
          <button
            key={d.status}
            onClick={() => open(d)}
            disabled={status === d.status}
            className="flex min-h-[44px] items-center justify-center gap-2 border border-line text-[9.5px] font-bold tracking-[0.22em] transition-colors hover:border-line-strong disabled:cursor-default disabled:opacity-30"
            style={{ color: d.color }}
          >
            <span
              className="h-1 w-1 rounded-full"
              style={{ background: d.color, boxShadow: `0 0 5px ${d.color}` }}
              aria-hidden
            />
            {d.label}
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        onClose={() => setChoice(null)}
        className="hud-panel m-auto w-[min(92vw,420px)] p-0 text-ink backdrop:bg-void/80"
      >
        {choice && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
            className="flex flex-col gap-3 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="hud-label" style={{ color: choice.color }}>
                {choice.label}
              </span>
              <span className="hud-sublabel">{ticketKey}</span>
              <div className="hud-rule" />
            </div>
            <p className="text-[11.5px] leading-relaxed text-ink/75">
              {choice.verb} <span className="text-bright">{ticketKey}</span>? It moves from{" "}
              <span className="text-bright">{TICKET_STATUS_META[status].label}</span> to{" "}
              <span style={{ color: choice.color }}>
                {TICKET_STATUS_META[choice.status].label}
              </span>
              .
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={choice.notePrompt}
              rows={4}
              maxLength={20_000}
              className="w-full border border-line bg-panel/70 p-3 text-[11.5px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none"
              autoFocus
            />
            {error && (
              <p className="text-[9.5px] tracking-[0.12em] text-danger">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="min-h-[44px] flex-1 border border-line-strong text-[9.5px] font-bold tracking-[0.22em] hover:text-bright disabled:opacity-40"
                style={{ color: choice.color }}
              >
                {pending ? "…" : `CONFIRM ${choice.label}`}
              </button>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="min-h-[44px] w-20 border border-line text-[9px] tracking-[0.2em] text-ink/40 hover:text-ink"
              >
                ESC
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
