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

const inputCls =
  "min-h-[40px] w-full border border-line bg-panel/70 px-3 text-[12px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none";

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
          <p className="py-5 text-center text-[10px] tracking-[0.2em] text-ink/30">
            NO DOCS · WRITE THE FIRST PAGE
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
                className="min-w-0 flex-1 truncate text-left text-[11.5px] text-ink hover:text-bright"
              >
                <span className="mr-2 text-[10px] text-accent" aria-hidden>
                  ▤
                </span>
                {d.title}
              </button>
              <span className="flex-none text-[9.5px] text-ink/35">{relTime(d.updatedAt)}</span>
              <button
                onClick={() => {
                  setEditing({ ...d });
                  setOpenId(d.id);
                }}
                className="flex-none px-1 text-[10px] text-ink/45 hover:text-accent"
                aria-label={`edit ${d.title}`}
              >
                ✎
              </button>
              <button
                onClick={() => remove(d.id)}
                className="flex-none px-1 text-[11px] text-ink/30 hover:text-danger"
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
                  className={`${inputCls} min-h-[200px] resize-y py-2 font-mono text-[11.5px] leading-relaxed`}
                  placeholder="markdown…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => save(editing)}
                    className="min-h-[36px] border border-line-strong bg-accent/10 px-4 text-[9.5px] font-bold tracking-[0.22em] text-accent hover:bg-accent/20"
                  >
                    SAVE
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="min-h-[36px] px-3 text-[9.5px] tracking-[0.22em] text-ink/40 hover:text-ink"
                  >
                    CANCEL
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
        <button
          onClick={() => setCreating(true)}
          className="hud-panel flex min-h-[40px] w-fit items-center gap-2 px-4 text-[9.5px] font-bold tracking-[0.22em] text-accent transition-colors hover:border-line-strong hover:text-bright"
        >
          + NEW DOC
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
        placeholder="TITLE"
        maxLength={300}
        autoFocus
        className={inputCls}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder="markdown…"
        className={`${inputCls} min-h-[140px] resize-y py-2 font-mono text-[11.5px] leading-relaxed`}
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSave(title, body)}
          className="min-h-[36px] border border-line-strong bg-accent/10 px-4 text-[9.5px] font-bold tracking-[0.22em] text-accent hover:bg-accent/20"
        >
          CREATE ▸
        </button>
        <button
          onClick={onCancel}
          className="min-h-[36px] px-3 text-[9.5px] tracking-[0.22em] text-ink/40 hover:text-ink"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
