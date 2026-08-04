"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteProject } from "@/app/actions";
import { isOffline, submitOp } from "@/lib/offline/queue";
import { PROJECT_STATUSES, type Project } from "@/db/schema";
import { PROJECT_STATUS_META } from "@/lib/ui";
import { SectionHeader } from "./hud";

type LinkDTO = { id: number; label: string; url: string };
type TagDTO = { name: string; color: string };

const inputCls = "field";

/* ------------------------------- links ------------------------------- */

export function LinksPanel({ slug, links }: { slug: string; links: LinkDTO[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(links);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ label: "", url: "" });

  useEffect(() => setItems(links), [links]);

  function saveEdit(id: number) {
    const lab = editDraft.label.trim();
    const u = /^https?:\/\//.test(editDraft.url) ? editDraft.url : `https://${editDraft.url}`;
    setEditId(null);
    if (!lab || !editDraft.url.trim()) return;
    setItems((ls) => ls.map((x) => (x.id === id ? { ...x, label: lab, url: u } : x)));
    startTransition(async () => {
      if (await submitOp({ kind: "link.update", slug, id, patch: { label: lab, url: u } })) {
        router.refresh();
      }
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        label="Links"
        sub={`${items.length} ${items.length === 1 ? "link" : "links"}`}
      />
      <ul className="flex flex-col">
        {items.map((l) => (
          <li key={l.id} className="group flex min-h-[44px] items-center gap-2">
            {editId === l.id ? (
              <span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                <input
                  value={editDraft.label}
                  onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(l.id);
                    if (e.key === "Escape") setEditId(null);
                  }}
                  autoFocus
                  className="w-full border-b border-line-strong bg-transparent text-[13px] text-bright focus:outline-none"
                />
                <input
                  value={editDraft.url}
                  onChange={(e) => setEditDraft({ ...editDraft, url: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(l.id);
                    if (e.key === "Escape") setEditId(null);
                  }}
                  onBlur={() => saveEdit(l.id)}
                  inputMode="url"
                  className="w-full border-b border-line bg-transparent text-[12px] text-ink/70 focus:outline-none"
                />
              </span>
            ) : (
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-[13px] text-ink hover:text-accent"
                title={l.url}
              >
                {l.label}
                <span className="ml-2 hidden text-[11px] text-ink/35 sm:inline">
                  {(() => {
                    try {
                      return new URL(l.url).hostname;
                    } catch {
                      return "";
                    }
                  })()}
                </span>
              </a>
            )}
            <button
              onClick={() => {
                setEditId(l.id);
                setEditDraft({ label: l.label, url: l.url });
              }}
              className="h-8 w-7 flex-none text-[12px] text-ink/20 hover:text-accent md:opacity-0 md:group-hover:opacity-100"
              aria-label={`edit link ${l.label}`}
            >
              ✎
            </button>
            <button
              onClick={() => {
                setItems((ls) => ls.filter((x) => x.id !== l.id));
                startTransition(async () => {
                  if (await submitOp({ kind: "link.delete", slug, id: l.id })) {
                    router.refresh();
                  }
                });
              }}
              className="h-8 w-8 flex-none text-ink/20 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
              aria-label={`delete link ${l.label}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim() || !url.trim()) return;
            const u = /^https?:\/\//.test(url) ? url : `https://${url}`;
            const temp: LinkDTO = { id: -Date.now(), label: label.trim(), url: u };
            setItems((ls) => [...ls, temp]);
            setLabel("");
            setUrl("");
            setAdding(false);
            startTransition(async () => {
              // temp link stays until fresh server data replaces it (or the queue flushes)
              const op = { kind: "link.add" as const, slug, label: temp.label, url: u, tempId: temp.id };
              if (await submitOp(op)) router.refresh();
            });
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className={inputCls} autoFocus />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" inputMode="url" className={inputCls} />
          <div className="flex gap-2">
            <button type="submit" className="btn-tint flex-1">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-quiet flex-none">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex min-h-[40px] w-fit items-center gap-1 text-[13px] font-medium text-accent hover:text-[#409cff]"
        >
          Add link
        </button>
      )}
    </section>
  );
}

/* -------------------------------- tags ------------------------------- */

export function TagEditor({
  slug,
  current,
  all,
}: {
  slug: string;
  current: TagDTO[];
  all: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(current);
  const [value, setValue] = useState("");

  useEffect(() => setItems(current), [current]);

  function commit(next: TagDTO[]) {
    setItems(next);
    startTransition(async () => {
      const names = next.map((t) => t.name);
      if (await submitOp({ kind: "tags.set", slug, names })) router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        label="Tags"
        sub={`${items.length} ${items.length === 1 ? "tag" : "tags"}`}
      />
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <button
            key={t.name}
            onClick={() => commit(items.filter((x) => x.name !== t.name))}
            className="group inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white/5 px-3 text-[12px] text-ink/75 transition-colors hover:bg-danger/15"
            title="remove tag"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} aria-hidden />
            {t.name}
            <span className="text-ink/30 group-hover:text-danger">×</span>
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = value.trim();
          if (!name) return;
          setValue("");
          if (items.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
          commit([...items, { name, color: "#b39cf5" }]);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add tag"
          list="all-tags"
          enterKeyHint="done"
          className={inputCls}
        />
        <datalist id="all-tags">
          {all.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </form>
    </section>
  );
}

/* ------------------------- status / priority ------------------------- */

export function ProjectControls({
  slug,
  status,
  priority,
}: {
  slug: string;
  status: Project["status"];
  priority: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [localStatus, setLocalStatus] = useState(status);
  const [localPriority, setLocalPriority] = useState(priority);

  useEffect(() => setLocalStatus(status), [status]);
  useEffect(() => setLocalPriority(priority), [priority]);

  function update(patch: { status?: Project["status"]; priority?: number }) {
    if (patch.status) setLocalStatus(patch.status);
    if (patch.priority) setLocalPriority(patch.priority);
    startTransition(async () => {
      if (await submitOp({ kind: "project.update", slug, patch })) router.refresh();
    });
  }

  const selectCls =
    "min-h-[44px] w-full cursor-pointer appearance-none rounded-[10px] border border-line bg-white/5 pr-8 text-[13px] font-medium text-bright transition-colors hover:border-line-strong focus:border-accent/60 focus:outline-none";

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader label="Controls" />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="hud-sublabel">Status</span>
          <span className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
              style={{ background: PROJECT_STATUS_META[localStatus].color }}
              aria-hidden
            />
            <select
              value={localStatus}
              onChange={(e) => update({ status: e.target.value as Project["status"] })}
              className={`${selectCls} pl-7`}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_META[s].label}
                </option>
              ))}
            </select>
            <SelectChevron />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="hud-sublabel">Priority</span>
          <span className="relative">
            <select
              value={localPriority}
              onChange={(e) => update({ priority: Number(e.target.value) })}
              className={`${selectCls} pl-3`}
            >
              <option value={1}>P1 · Now</option>
              <option value={2}>P2 · Normal</option>
              <option value={3}>P3 · Whenever</option>
            </select>
            <SelectChevron />
          </span>
        </label>
      </div>
      <button
        onClick={() => {
          if (isOffline()) return; // deleting a project is online-only, on purpose
          if (pendingDelete) {
            startTransition(async () => {
              await actionDeleteProject(slug);
            });
          } else {
            setPendingDelete(true);
            setTimeout(() => setPendingDelete(false), 3000);
          }
        }}
        className={`min-h-[36px] self-end px-1 text-[12px] font-medium transition-colors ${
          pendingDelete
            ? "text-danger"
            : "text-ink/25 hover:text-danger/80"
        }`}
      >
        {pendingDelete ? "Tap again to permanently delete" : "Delete project"}
      </button>
    </section>
  );
}

function SelectChevron() {
  return (
    <svg
      viewBox="0 0 10 6"
      className="pointer-events-none absolute right-3 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-ink/40"
      aria-hidden
    >
      <path
        d="M1 1l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
