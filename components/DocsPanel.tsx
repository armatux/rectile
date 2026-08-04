"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";
import { relTime } from "@/lib/ui";

export type DocDTO = {
  id: number;
  title: string;
  body: string;
  updatedAt: string;
};

const inputCls = "field";

/** Per-project markdown documentation: list → read (rendered) → edit.
 *  Writes ride the offline ops queue like every other mutation. */
export function DocsPanel({
  slug,
  docs,
  renderedById,
}: {
  slug: string;
  docs: DocDTO[];
  /** server-rendered markdown html, keyed by doc id (marked runs server-side) */
  renderedById: Record<number, string>;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<DocDTO | null>(null);
  const [creating, setCreating] = useState(false);

  function save(doc: DocDTO) {
    const title = doc.title.trim();
    if (!title) return;
    setEditing(null);
    void submitOp({
      kind: "doc.update",
      slug,
      id: doc.id,
      patch: { title, body: doc.body },
    }).then((d) => d && router.refresh());
  }

  function create(title: string, body: string) {
    if (!title.trim()) return;
    setCreating(false);
    void submitOp({
      kind: "doc.add",
      slug,
      title: title.trim(),
      body,
      tempId: -Date.now(),
    }).then((d) => d && router.refresh());
  }

  function remove(id: number) {
    setOpenId(null);
    void submitOp({ kind: "doc.delete", slug, id }).then((d) => d && router.refresh());
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="hud-panel flex flex-col p-2">
        {docs.length === 0 && (
          <p className="py-5 text-center text-[12px] text-ink/35">
            No docs yet — write the first page.
          </p>
        )}
        {docs.map((d) => (
          <div key={d.id} className="border-b border-line/60 last:border-b-0">
            <div className="flex items-baseline gap-3 px-2 py-2.5">
              <button
                onClick={() => {
                  setOpenId(openId === d.id ? null : d.id);
                  setEditing(null);
                }}
                className="min-w-0 flex-1 truncate text-left text-[13px] text-ink hover:text-bright"
              >
                {d.title}
              </button>
              <span className="flex-none text-[12px] text-ink/35">{relTime(d.updatedAt)}</span>
              <button
                onClick={() => {
                  setEditing({ ...d });
                  setOpenId(d.id);
                }}
                className="flex-none px-1 text-[12px] text-ink/45 hover:text-accent"
                aria-label={`edit ${d.title}`}
              >
                ✎
              </button>
              <button
                onClick={() => remove(d.id)}
                className="flex-none px-1 text-[13px] text-ink/30 hover:text-danger"
                aria-label={`delete ${d.title}`}
              >
                ×
              </button>
            </div>
            {openId === d.id && !editing && (
              <div
                className="md fade-in px-3 pb-3 text-ink/80"
                dangerouslySetInnerHTML={{ __html: renderedById[d.id] ?? "" }}
              />
            )}
            {openId === d.id && editing?.id === d.id && (
              <div className="fade-in flex flex-col gap-2 px-2 pb-3">
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className={inputCls}
                  maxLength={300}
                />
                <textarea
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  rows={12}
                  className={`${inputCls} min-h-[200px] resize-y py-2 font-mono text-[12px]! leading-relaxed`}
                  placeholder="markdown…"
                />
                <div className="flex gap-2">
                  <button onClick={() => save(editing)} className="btn-tint">
                    Save
                  </button>
                  <button onClick={() => setEditing(null)} className="btn-quiet">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {creating ? (
        <NewDocForm onSave={create} onCancel={() => setCreating(false)} />
      ) : (
        <button onClick={() => setCreating(true)} className="btn-quiet w-fit">
          New doc
        </button>
      )}
    </div>
  );
}

function NewDocForm({
  onSave,
  onCancel,
}: {
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="hud-panel fade-in flex flex-col gap-2 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        maxLength={300}
        autoFocus
        className={inputCls}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder="markdown…"
        className={`${inputCls} min-h-[140px] resize-y py-2 font-mono text-[12px]! leading-relaxed`}
      />
      <div className="flex gap-2">
        <button onClick={() => onSave(title, body)} className="btn-tint">
          Create
        </button>
        <button onClick={onCancel} className="btn-quiet">
          Cancel
        </button>
      </div>
    </div>
  );
}
