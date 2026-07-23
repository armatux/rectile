"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";

const inputCls =
  "min-h-[44px] w-full border border-line bg-panel/70 px-3 text-[12px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none";

export function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [queuedName, setQueuedName] = useState<string | null>(null);

  /* queue-first like every mutation: durable in IndexedDB, delivered
     immediately when the server is reachable */
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return;
    const tagsRaw = String(fd.get("tags") ?? "");
    setOpen(false);
    void submitOp({
      kind: "project.create",
      name,
      description: String(fd.get("description") ?? "").trim() || undefined,
      category: String(fd.get("category") ?? "").trim() || undefined,
      priority: Number(fd.get("priority") ?? 2),
      tags: tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
    }).then((delivered) => {
      if (delivered) {
        setQueuedName(null);
        router.refresh();
      } else {
        setQueuedName(name);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="hud-panel flex min-h-[44px] items-center gap-2 px-4 text-[10px] font-bold tracking-[0.24em] text-accent transition-colors hover:border-line-strong hover:text-bright"
        >
          + NEW PROJECT
        </button>
        {queuedName && (
          <span className="text-[9px] tracking-[0.18em] text-warn">
            “{queuedName.toUpperCase()}” QUEUED · APPEARS AFTER RECONNECT
          </span>
        )}
      </div>
    );
  }
  return (
    <form
      onSubmit={submit}
      className="hud-panel fade-in flex w-full flex-col gap-2 p-4 sm:max-w-md"
    >
      <div className="flex items-center gap-2">
        <span className="hud-label">NEW PROJECT</span>
        <div className="hud-rule" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center text-ink/40 hover:text-bright"
          aria-label="close"
        >
          ×
        </button>
      </div>
      <input name="name" required maxLength={200} placeholder="NAME" className={inputCls} autoFocus />
      <textarea
        name="description"
        placeholder="description (optional)"
        rows={2}
        className={`${inputCls} resize-none py-2.5`}
      />
      <div className="flex gap-2">
        <input name="category" placeholder="category" className={inputCls} />
        <select name="priority" defaultValue="2" className={`${inputCls} w-24 flex-none`}>
          <option value="1">P1</option>
          <option value="2">P2</option>
          <option value="3">P3</option>
        </select>
      </div>
      <input name="tags" placeholder="tags, comma, separated" className={inputCls} />
      <button
        type="submit"
        className="min-h-[44px] border border-line-strong bg-accent/10 text-[10px] font-bold tracking-[0.24em] text-accent transition-colors hover:bg-accent/20 hover:text-bright"
      >
        INITIALIZE ▸
      </button>
    </form>
  );
}
