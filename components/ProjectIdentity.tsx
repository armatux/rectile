"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";

const inputCls =
  "min-h-[40px] w-full border border-line bg-panel/70 px-3 text-[12px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none";

/** Click-to-edit project identity: name, description, category.
 *  The slug (and every URL) stays stable across renames. */
export function ProjectIdentity({
  slug,
  name,
  description,
  category,
  children,
}: {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  /** badges row rendered next to the name (priority/status/staleness) */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name, description: description ?? "", category: category ?? "" });

  function save() {
    const n = draft.name.trim();
    if (!n) return;
    setEditing(false);
    void submitOp({
      kind: "project.update",
      slug,
      patch: {
        name: n,
        description: draft.description.trim() || null,
        category: draft.category.trim() || null,
      },
    }).then((d) => d && router.refresh());
  }

  if (editing) {
    return (
      <div className="fade-in flex max-w-2xl flex-col gap-2">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          maxLength={200}
          autoFocus
          className={`${inputCls} font-display text-[18px] font-bold`}
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          placeholder="description"
          className={`${inputCls} resize-none py-2`}
        />
        <div className="flex gap-2">
          <input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder="category"
            maxLength={100}
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={save}
            className="min-h-[40px] flex-none border border-line-strong bg-accent/10 px-4 text-[9.5px] font-bold tracking-[0.22em] text-accent hover:bg-accent/20"
          >
            SAVE
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setDraft({ name, description: description ?? "", category: category ?? "" });
            }}
            className="min-h-[40px] flex-none px-3 text-[9.5px] tracking-[0.22em] text-ink/40 hover:text-ink"
          >
            CANCEL
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          className="font-display text-[24px] font-bold tracking-[0.04em] text-bright sm:text-[30px]"
          style={{ textShadow: "0 0 22px rgb(150 110 255 / 0.4)" }}
        >
          {name}
        </h1>
        <button
          onClick={() => setEditing(true)}
          aria-label="edit project identity"
          className="flex h-8 w-8 items-center justify-center text-[12px] text-ink/30 transition-colors hover:text-accent"
        >
          ✎
        </button>
        {children}
      </div>
      {description && (
        <p className="max-w-2xl text-[12px] leading-relaxed text-ink/65">{description}</p>
      )}
    </>
  );
}
