"use client";

import { useState } from "react";
import { actionCreateProject } from "@/app/actions";

const inputCls =
  "min-h-[44px] w-full border border-line bg-panel/70 px-3 text-[12px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none";

export function NewProjectForm() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hud-panel flex min-h-[44px] items-center gap-2 px-4 text-[10px] font-bold tracking-[0.24em] text-accent transition-colors hover:border-line-strong hover:text-bright"
      >
        + NEW PROJECT
      </button>
    );
  }
  return (
    <form
      action={actionCreateProject}
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
