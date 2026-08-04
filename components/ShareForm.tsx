"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseReminderText } from "@/lib/nl";
import { submitOp } from "@/lib/offline/queue";
import { repeatLabel } from "@/lib/recur";

type Mode = "reminder" | "log" | "link";

/**
 * Quick-capture for shared content (Web Share Target) — turns whatever was
 * shared into a reminder, a project log entry, or a project link. Rides the
 * offline ops queue, so capturing works without a connection too.
 */
export function ShareForm({
  sharedTitle,
  sharedText,
  sharedUrl,
  projects,
}: {
  sharedTitle?: string;
  sharedText?: string;
  sharedUrl?: string;
  projects: { slug: string; name: string }[];
}) {
  const router = useRouter();
  // some apps put the URL into `text` — split it out
  const urlFromText = sharedText?.match(/https?:\/\/\S+/)?.[0];
  const url = sharedUrl ?? urlFromText;
  const text = [sharedTitle, sharedText?.replace(url ?? "", "").trim()]
    .filter(Boolean)
    .join(" — ");

  const [mode, setMode] = useState<Mode>(url ? "link" : "reminder");
  const [body, setBody] = useState(text || url || "");
  const [linkLabel, setLinkLabel] = useState(text || "shared link");
  const [linkUrl, setLinkUrl] = useState(url ?? "");
  const [slug, setSlug] = useState(projects[0]?.slug ?? "");
  const [state, setState] = useState<"idle" | "busy" | "queued">("idle");

  const slugs = useMemo(() => projects.map((p) => p.slug), [projects]);
  const parsed = useMemo(
    () =>
      mode === "reminder" && body.trim()
        ? parseReminderText(body, new Date(), slugs)
        : null,
    [mode, body, slugs],
  );

  async function submit() {
    if (state === "busy") return;
    setState("busy");
    let delivered = false;
    if (mode === "reminder") {
      const p = parseReminderText(body, new Date(), slugs);
      if (!p.title) return setState("idle");
      delivered = await submitOp({
        kind: "reminder.add",
        title: url && !p.title.includes(url) ? `${p.title} ${url}` : p.title,
        dueAt: p.dueAt?.toISOString(),
        repeat: p.repeat,
        projectSlug: p.projectSlug,
        tempId: -Date.now(),
      });
      router.push("/reminders");
    } else if (mode === "log") {
      if (!slug || !body.trim()) return setState("idle");
      delivered = await submitOp({
        kind: "log.add",
        slug,
        body: url ? `${body.trim()}\n${url}` : body.trim(),
        tempId: -Date.now(),
      });
      router.push(`/p/${slug}`);
    } else {
      if (!slug || !linkUrl.trim() || !linkLabel.trim()) return setState("idle");
      delivered = await submitOp({
        kind: "link.add",
        slug,
        label: linkLabel.trim(),
        url: linkUrl.trim(),
        tempId: -Date.now(),
      });
      router.push(`/p/${slug}`);
    }
    setState(delivered ? "idle" : "queued");
  }

  const tab = (m: Mode, label: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`min-h-[40px] rounded-full px-4 text-[13px] font-medium transition-colors ${
        mode === m
          ? "bg-accent/15 text-accent"
          : "text-ink/50 hover:text-bright"
      }`}
    >
      {label}
    </button>
  );

  const input = "field";

  return (
    <section className="hud-panel mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
      <div className="flex gap-2">
        {tab("reminder", "Reminder")}
        {tab("log", "Log entry")}
        {tab("link", "Link")}
      </div>

      {mode !== "link" && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={mode === "log" ? 4 : 2}
          placeholder={mode === "reminder" ? "What + when — e.g. read this tomorrow" : "Log entry"}
          className={`${input} resize-y py-2`}
        />
      )}
      {mode === "reminder" && parsed && (parsed.dueAt || parsed.repeat || parsed.projectSlug) && (
        <p className="-mt-1 text-[12px] text-ink/45">
          {parsed.title}
          {parsed.dueAt && (
            <span className="ml-2 text-bright">
              {parsed.dueAt.toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {parsed.repeat && (
            <span className="ml-2 text-cyan/80">{repeatLabel(parsed.repeat)}</span>
          )}
          {parsed.projectSlug && (
            <span className="ml-2 text-accent/80">#{parsed.projectSlug}</span>
          )}
        </p>
      )}

      {mode === "link" && (
        <>
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label"
            className={input}
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className={input}
          />
        </>
      )}

      {mode !== "reminder" && (
        <span className="relative w-full">
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={`${input} cursor-pointer appearance-none pr-8! [color-scheme:dark]`}
            aria-label="project"
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
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
      )}

      <button
        onClick={submit}
        disabled={state === "busy"}
        className="btn-tint min-h-[44px] disabled:opacity-40"
      >
        {state === "busy" ? "…" : "Capture"}
      </button>
      {state === "queued" && (
        <p className="text-[12px] text-warn">
          Offline — queued, will sync when you&rsquo;re back online.
        </p>
      )}
    </section>
  );
}
