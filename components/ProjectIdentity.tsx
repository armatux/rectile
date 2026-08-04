"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";

const inputCls = "field";

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
          className={`${inputCls} font-display text-[17px]! font-semibold`}
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
          <button onClick={save} className="btn-tint flex-none">
            Save
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setDraft({ name, description: description ?? "", category: category ?? "" });
            }}
            className="btn-quiet flex-none"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-bright sm:text-[28px]">
          {name}
        </h1>
        <button
          onClick={() => setEditing(true)}
          aria-label="edit project identity"
          className="flex h-8 w-8 items-center justify-center text-[13px] text-ink/30 transition-colors hover:text-accent"
        >
          ✎
        </button>
        {children}
      </div>
      {description && (
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink/65">{description}</p>
      )}
    </>
  );
}
