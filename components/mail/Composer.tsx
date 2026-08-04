"use client";

import { useState } from "react";

export type ComposerAccount = { id: string; label: string; user: string };

export function Composer({
  accounts,
  defaultAccount,
  initialTo = "",
  initialSubject = "",
  inReplyTo,
}: {
  accounts: ComposerAccount[];
  defaultAccount: string;
  initialTo?: string;
  initialSubject?: string;
  inReplyTo?: string;
}) {
  const [account, setAccount] = useState(defaultAccount);
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "confirm" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function send() {
    setState("sending");
    setError("");
    try {
      const res = await fetch("/mail/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Rectile-Mail": "1" },
        body: JSON.stringify({ account, to, subject, body, inReplyTo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setState("sent");
      setBody("");
      if (!inReplyTo) {
        setTo("");
        setSubject("");
      }
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
      setState("error");
    }
  }

  const ready = to.trim() && subject.trim() && body.trim();

  return (
    <form
      className="glass-heavy flex flex-col gap-2.5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || state === "sending") return;
        if (state !== "confirm") {
          setState("confirm");
          setTimeout(() => setState((s) => (s === "confirm" ? "idle" : s)), 4000);
          return;
        }
        void send();
      }}
    >
      {accounts.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="hud-sublabel w-10 flex-none">From</span>
          <span className="relative w-full">
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="field cursor-pointer appearance-none pr-8!"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {a.user}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 12 12"
              fill="none"
              className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-ink/40"
              aria-hidden
            >
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </label>
      )}
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="to@example.com"
        inputMode="email"
        className="field"
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="field"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message…"
        rows={7}
        className="field resize-y py-2.5! leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!ready || state === "sending"}
          className={
            state === "confirm"
              ? "inline-flex min-h-[36px] items-center justify-center rounded-full bg-warn/15 px-4 text-[13px] font-semibold text-warn transition-colors hover:bg-warn/25 disabled:opacity-40"
              : "btn-tint disabled:opacity-40"
          }
        >
          {state === "sending"
            ? "Sending…"
            : state === "confirm"
              ? "Tap again to send"
              : "Send"}
        </button>
        {state === "sent" && (
          <span className="text-[12px] font-medium text-ok">Sent</span>
        )}
        {state === "error" && (
          <span className="truncate text-[12px] text-danger">{error}</span>
        )}
      </div>
    </form>
  );
}
