"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionAddLog, actionDeleteLog } from "@/app/actions";
import { renderMarkdown } from "@/lib/markdown";
import { longDate, relTime } from "@/lib/ui";

export type LogDTO = { id: number; body: string; createdAt: string };

export function LogFeed({
  slug,
  initialLogs,
}: {
  slug: string;
  initialLogs: LogDTO[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [logs, setLogs] = useState(initialLogs);
  const [value, setValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setLogs(initialLogs), [initialLogs]);

  function submit() {
    const body = value.trim();
    if (!body) return;
    setValue("");
    const temp: LogDTO = {
      id: -Date.now(),
      body,
      createdAt: new Date().toISOString(),
    };
    setLogs((ls) => [temp, ...ls]);
    startTransition(async () => {
      const res = await actionAddLog(slug, body);
      setLogs((ls) =>
        ls.map((l) => (l.id === temp.id ? { ...l, id: res.logEntry.id } : l)),
      );
      router.refresh();
    });
  }

  function requestDelete(id: number) {
    if (pendingDelete === id) {
      clearTimeout(deleteTimer.current);
      setPendingDelete(null);
      setLogs((ls) => ls.filter((l) => l.id !== id));
      startTransition(async () => {
        await actionDeleteLog(slug, id);
        router.refresh();
      });
    } else {
      setPendingDelete(id);
      clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setPendingDelete(null), 2500);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      {/* quick capture, pinned on top: one tap, type, enter */}
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
          placeholder="what did you just do?"
          enterKeyHint="send"
          className="min-h-[48px] w-full bg-transparent text-[12px] text-bright placeholder:text-ink/30 focus:outline-none"
        />
        <button
          type="submit"
          className="min-h-[44px] flex-none text-[9px] font-bold tracking-[0.2em] text-accent hover:text-bright"
          aria-label="log it"
        >
          LOG
        </button>
      </form>

      <div className="flex flex-col">
        {logs.map((l) => (
          <article
            key={l.id}
            className="fade-in group flex gap-3 border-b border-line/60 py-3 last:border-b-0"
          >
            <div className="w-14 flex-none pt-0.5 text-right">
              <time
                dateTime={l.createdAt}
                title={longDate(l.createdAt)}
                className="text-[9.5px] tracking-[0.12em] text-ink/40"
              >
                {relTime(l.createdAt)}
              </time>
            </div>
            <div
              className="md min-w-0 flex-1 text-ink/85"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(l.body) }}
            />
            <button
              onClick={() => requestDelete(l.id)}
              className={`h-8 w-8 flex-none text-[11px] transition-opacity ${
                pendingDelete === l.id
                  ? "text-danger"
                  : "text-ink/20 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
              }`}
              aria-label="delete log entry"
            >
              {pendingDelete === l.id ? "✓?" : "×"}
            </button>
          </article>
        ))}
        {logs.length === 0 && (
          <p className="py-6 text-center text-[10px] tracking-[0.2em] text-ink/30">
            NO LOG ENTRIES · WRITE THE FIRST ONE ABOVE
          </p>
        )}
      </div>
    </section>
  );
}
