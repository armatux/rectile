"use client";

import { useState } from "react";

const inputCls =
  "min-h-[42px] w-full border border-line bg-panel/70 px-3 text-[11.5px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none";

export function Composer({
  initialTo = "",
  initialSubject = "",
  inReplyTo,
}: {
  initialTo?: string;
  initialSubject?: string;
  inReplyTo?: string;
}) {
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
        body: JSON.stringify({ to, subject, body, inReplyTo }),
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
      className="hud-panel flex flex-col gap-2 p-4"
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
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="to@example.com"
        inputMode="email"
        className={inputCls}
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="subject"
        className={inputCls}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="write…"
        rows={7}
        className={`${inputCls} resize-y py-2.5 leading-relaxed`}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!ready || state === "sending"}
          className={`min-h-[42px] border px-5 text-[9px] font-bold tracking-[0.22em] transition-colors disabled:opacity-40 ${
            state === "confirm"
              ? "border-warn/70 bg-warn/10 text-warn"
              : "border-line-strong text-accent hover:bg-accent/10"
          }`}
        >
          {state === "sending"
            ? "TRANSMITTING…"
            : state === "confirm"
              ? "TAP AGAIN TO SEND"
              : "SEND ▸"}
        </button>
        {state === "sent" && (
          <span className="text-[9.5px] font-bold tracking-[0.18em] text-ok">✓ SENT</span>
        )}
        {state === "error" && (
          <span className="truncate text-[9.5px] tracking-[0.1em] text-danger">⚠ {error}</span>
        )}
      </div>
    </form>
  );
}
