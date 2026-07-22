import Link from "next/link";
import type { Tag } from "@/db/schema";
import { PROJECT_STATUSES } from "@/db/schema";

export type DashboardParams = {
  status?: string;
  tag?: string;
  sort?: string;
};

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
  ["staleness", "STALEST"],
  ["priority", "PRIORITY"],
  ["name", "NAME"],
  ["updated", "UPDATED"],
] as const;

export function FilterBar({
  params,
  tags,
}: {
  params: DashboardParams;
  tags: Tag[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hud-sublabel mr-1 w-14 flex-none">STATUS</span>
        <Chip href={buildHref(params, { status: undefined })} active={!params.status}>
          ALL
        </Chip>
        {PROJECT_STATUSES.map((s) => (
          <Chip
            key={s}
            href={buildHref(params, { status: params.status === s ? undefined : s })}
            active={params.status === s}
          >
            {s.toUpperCase().replace("_", " ")}
          </Chip>
        ))}
        <span className="hud-sublabel ml-auto hidden sm:inline">SORT</span>
        {SORTS.map(([key, label]) => (
          <Chip
            key={key}
            href={buildHref(params, { sort: key === "staleness" ? undefined : key })}
            active={(params.sort ?? "staleness") === key}
          >
            {label}
          </Chip>
        ))}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hud-sublabel mr-1 w-14 flex-none">TAGS</span>
          {tags.map((t) => (
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
        </div>
      )}
    </div>
  );
}
