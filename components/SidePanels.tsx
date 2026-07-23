"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  actionAddLink,
  actionDeleteLink,
  actionDeleteProject,
  actionSetTags,
  actionUpdateProject,
} from "@/app/actions";
import { PROJECT_STATUSES, type Project } from "@/db/schema";
import { PROJECT_STATUS_META } from "@/lib/ui";
import { SectionHeader } from "./hud";

type LinkDTO = { id: number; label: string; url: string };
type TagDTO = { name: string; color: string };

const inputCls =
  "min-h-[44px] w-full border border-line bg-panel/70 px-3 text-[11px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none";

/* ------------------------------- links ------------------------------- */

export function LinksPanel({ slug, links }: { slug: string; links: LinkDTO[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader label="LINKS" sub={`×${links.length}`} />
      <ul className="flex flex-col">
        {links.map((l) => (
          <li key={l.id} className="group flex min-h-[44px] items-center gap-2">
            <span className="text-[10px] text-accent" aria-hidden>
              ◈
            </span>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-[11.5px] text-ink hover:text-accent"
              title={l.url}
            >
              {l.label}
              <span className="ml-2 hidden text-[9px] text-ink/30 sm:inline">
                {(() => {
                  try {
                    return new URL(l.url).hostname;
                  } catch {
                    return "";
                  }
                })()}
              </span>
            </a>
            <button
              onClick={() =>
                startTransition(async () => {
                  await actionDeleteLink(slug, l.id);
                  router.refresh();
                })
              }
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
            startTransition(async () => {
              await actionAddLink(slug, label.trim(), u);
              setLabel("");
              setUrl("");
              setAdding(false);
              router.refresh();
            });
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label" className={inputCls} autoFocus />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="url" inputMode="url" className={inputCls} />
          <div className="flex gap-2">
            <button type="submit" className="min-h-[40px] flex-1 border border-line-strong text-[9px] font-bold tracking-[0.2em] text-accent hover:text-bright">
              ATTACH
            </button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-[40px] w-16 border border-line text-[9px] tracking-[0.2em] text-ink/40 hover:text-ink">
              ESC
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex min-h-[40px] items-center gap-1 text-[9px] font-bold tracking-[0.22em] text-ink/40 hover:text-accent"
        >
          + ADD LINK
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
  const [value, setValue] = useState("");

  function commit(names: string[]) {
    startTransition(async () => {
      await actionSetTags(slug, names);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader label="TAGS" sub={`×${current.length}`} />
      <div className="flex flex-wrap gap-1.5">
        {current.map((t) => (
          <button
            key={t.name}
            onClick={() => commit(current.filter((x) => x.name !== t.name).map((x) => x.name))}
            className="group inline-flex min-h-[36px] items-center gap-1.5 border border-line px-2 text-[9px] tracking-[0.14em] text-ink/70 hover:border-danger/60"
            title="remove tag"
          >
            <span className="h-1 w-1 rounded-full" style={{ background: t.color }} aria-hidden />
            {t.name.toUpperCase()}
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
          if (current.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
          commit([...current.map((t) => t.name), name]);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+ tag"
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

  function update(patch: Record<string, unknown>) {
    startTransition(async () => {
      await actionUpdateProject(slug, patch);
      router.refresh();
    });
  }

  const selectCls =
    "min-h-[44px] w-full cursor-pointer appearance-none border border-line bg-panel/70 pr-7 text-[10px] font-semibold tracking-[0.16em] text-bright hover:border-line-strong focus:border-line-strong focus:outline-none";

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader label="CONTROLS" />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="hud-sublabel">STATUS</span>
          <span className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
              style={{
                background: PROJECT_STATUS_META[status].color,
                boxShadow: `0 0 5px ${PROJECT_STATUS_META[status].color}`,
              }}
              aria-hidden
            />
            <select
              value={status}
              onChange={(e) => update({ status: e.target.value })}
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
          <span className="hud-sublabel">PRIORITY</span>
          <span className="relative">
            <select
              value={priority}
              onChange={(e) => update({ priority: Number(e.target.value) })}
              className={`${selectCls} pl-3`}
            >
              <option value={1}>P1 · NOW</option>
              <option value={2}>P2 · NORMAL</option>
              <option value={3}>P3 · WHENEVER</option>
            </select>
            <SelectChevron />
          </span>
        </label>
      </div>
      <button
        onClick={() => {
          if (pendingDelete) {
            startTransition(async () => {
              await actionDeleteProject(slug);
            });
          } else {
            setPendingDelete(true);
            setTimeout(() => setPendingDelete(false), 3000);
          }
        }}
        className={`min-h-[36px] self-end px-1 text-[9px] font-bold tracking-[0.22em] transition-colors ${
          pendingDelete
            ? "text-danger"
            : "text-ink/25 hover:text-danger/80"
        }`}
      >
        {pendingDelete ? "TAP AGAIN TO ERASE PERMANENTLY" : "× ERASE PROJECT"}
      </button>
    </section>
  );
}

function SelectChevron() {
  return (
    <span
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-ink/40"
      aria-hidden
    >
      ▾
    </span>
  );
}
