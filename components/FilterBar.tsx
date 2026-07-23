"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Tag } from "@/db/schema";
import { PROJECT_STATUSES } from "@/db/schema";
import { PROJECT_STATUS_META } from "@/lib/ui";

export type DashboardParams = {
  status?: string;
  tag?: string;
  sort?: string;
};

/** Tags shown before the "+N more" expander. */
const VISIBLE_TAGS = 8;

function buildHref(current: DashboardParams, patch: DashboardParams): string {
  const merged = { ...current, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

function Chip({
  href,
  active,
  children,
  color,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[36px] items-center gap-1.5 border px-2.5 text-[9px] font-semibold tracking-[0.18em] transition-colors ${
        active
          ? "border-line-strong bg-accent/10 text-bright"
          : "border-line text-ink/50 hover:border-line-strong hover:text-ink"
      }`}
    >
      {color && (
        <span
          className="h-1 w-1 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
      )}
      {children}
    </Link>
  );
}

const SORTS = [
  ["staleness", "STALEST FIRST"],
  ["priority", "PRIORITY"],
  ["name", "NAME"],
  ["updated", "RECENTLY UPDATED"],
] as const;

export function FilterBar({
  params,
  tags,
  archivedCount = 0,
}: {
  params: DashboardParams;
  tags: (Tag & { projectCount: number })[];
  archivedCount?: number;
}) {
  const router = useRouter();
  const [allTags, setAllTags] = useState(false);

  /* most-used first; the selected tag is always kept visible */
  const ranked = [...tags].sort(
    (a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name),
  );
  const selected = ranked.find((t) => t.name === params.tag);
  let visible = allTags ? ranked : ranked.slice(0, VISIBLE_TAGS);
  if (!allTags && selected && !visible.includes(selected)) {
    visible = [...visible.slice(0, VISIBLE_TAGS - 1), selected];
  }
  const hidden = ranked.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hud-sublabel mr-1 w-14 flex-none">STATUS</span>
        <Chip href={buildHref(params, { status: undefined })} active={!params.status}>
          ALL
        </Chip>
        {PROJECT_STATUSES.filter((s) => s !== "archived").map((s) => (
          <Chip
            key={s}
            href={buildHref(params, { status: params.status === s ? undefined : s })}
            active={params.status === s}
            color={params.status === s ? PROJECT_STATUS_META[s].color : undefined}
          >
            {s.toUpperCase().replace("_", " ")}
          </Chip>
        ))}
        {archivedCount > 0 && (
          <Chip href="/archive" active={false}>
            ARCHIVE · {String(archivedCount).padStart(2, "0")} ▸
          </Chip>
        )}
        <label className="ml-auto flex items-center gap-2">
          <span className="hud-sublabel hidden sm:inline">SORT</span>
          <span className="relative">
            <select
              value={params.sort ?? "staleness"}
              onChange={(e) =>
                router.push(
                  buildHref(params, {
                    sort: e.target.value === "staleness" ? undefined : e.target.value,
                  }),
                )
              }
              className="min-h-[36px] cursor-pointer appearance-none border border-line bg-panel/70 pl-2.5 pr-7 text-[9px] font-semibold tracking-[0.18em] text-ink hover:border-line-strong focus:border-line-strong focus:outline-none"
              aria-label="sort projects"
            >
              {SORTS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-ink/40"
              aria-hidden
            >
              ▾
            </span>
          </span>
        </label>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hud-sublabel mr-1 w-14 flex-none">TAGS</span>
          {visible.map((t) => (
            <Chip
              key={t.id}
              href={buildHref(params, {
                tag: params.tag === t.name ? undefined : t.name,
              })}
              active={params.tag === t.name}
              color={t.color}
            >
              {t.name.toUpperCase()}
            </Chip>
          ))}
          {(hidden > 0 || allTags) && (
            <button
              onClick={() => setAllTags((v) => !v)}
              className="flex min-h-[36px] items-center border border-transparent px-2 text-[9px] font-semibold tracking-[0.18em] text-ink/40 hover:text-accent"
              aria-expanded={allTags}
            >
              {allTags ? "− LESS" : `+${hidden} MORE`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
