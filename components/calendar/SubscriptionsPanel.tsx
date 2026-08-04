"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";

export type CalSub = { label: string; url: string };

const inputCls = "field min-w-0";

/**
 * Read-only calendar subscriptions (ICS URLs — e.g. Proton Calendar's
 * "Share via link"). Stored in kv `calendar_subscriptions`; the URL itself
 * is the secret, so it never leaves the server once saved.
 */
export function SubscriptionsPanel({
  subs,
  errors,
}: {
  subs: CalSub[];
  errors: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(subs);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  function commit(next: CalSub[]) {
    setItems(next);
    startTransition(async () => {
      if (
        await submitOp({ kind: "kv.set", key: "calendar_subscriptions", value: next })
      ) {
        router.refresh();
      }
    });
  }

  return (
    <section className="glass flex max-w-2xl flex-col gap-3 p-4">
      {items.map((s) => (
        <div key={s.url} className="group flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-cyan" aria-hidden />
          <span className="flex-none text-[13px] font-medium text-bright">
            {s.label}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink/35">{s.url}</span>
          <button
            onClick={() => commit(items.filter((x) => x.url !== s.url))}
            className="h-8 w-8 flex-none text-ink/25 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
            aria-label={`remove subscription ${s.label}`}
          >
            ×
          </button>
        </div>
      ))}
      {errors.map((e) => (
        <p key={e} className="text-[12px] text-warn">
          {e}
        </p>
      ))}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const l = label.trim();
          const u = url.trim();
          if (!l || !/^https:\/\//.test(u)) return;
          if (items.some((x) => x.url === u)) return;
          setLabel("");
          setUrl("");
          commit([...items, { label: l, url: u }]);
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Proton)"
          className={`${inputCls} sm:max-w-40 sm:flex-none`}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… ICS share link"
          inputMode="url"
          className={inputCls}
        />
        <button type="submit" className="btn-tint flex-none">
          Subscribe
        </button>
      </form>
      <p className="text-[12px] leading-relaxed text-ink/40">
        Proton Calendar: calendar.proton.me → gear icon on your calendar →{" "}
        <span className="text-ink/60">Share via link</span> → create a link (full
        or busy-only) and paste it here. Events show read-only in cyan and
        refresh every ~10 minutes.
      </p>
    </section>
  );
}
