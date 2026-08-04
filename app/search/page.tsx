import Link from "next/link";
import { SectionHeader } from "@/components/hud";
import { search } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata = { title: "search" };

const KIND_META: Record<string, { label: string; color: string }> = {
  project: { label: "Project", color: "var(--color-accent)" },
  feature: { label: "Feature", color: "var(--color-ok)" },
  log_entry: { label: "Log", color: "var(--color-cyan)" },
};

/** ts_headline output: escape everything, then re-allow only <b>. */
function sanitizeSnippet(html: string): string {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>");
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const results = q ? await search(q) : [];

  return (
    <div className="flex flex-col gap-5 pt-5">
      <SectionHeader
        label="Search"
        sub={
          q
            ? `“${q}” · ${results.length} result${results.length === 1 ? "" : "s"}`
            : "Type to search"
        }
      />
      {!q && (
        <p className="text-[13px] text-ink/50">
          Type a query in the search bar above — full-text across projects,
          roadmap features and log entries.
        </p>
      )}
      <ul className="flex flex-col">
        {results.map((r) => {
          const meta = KIND_META[r.kind] ?? KIND_META.project;
          return (
            <li key={`${r.kind}-${r.refId}`}>
              <Link
                href={`/p/${r.projectSlug}`}
                className="group flex min-h-[56px] flex-col justify-center gap-1 border-b border-line py-3 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[13px] font-semibold text-bright group-hover:text-accent">
                    {r.title}
                  </span>
                  <span className="text-[12px] text-ink/40">
                    {r.projectName}
                  </span>
                </div>
                <p
                  className="hit text-[12px] leading-relaxed text-ink/60"
                  dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
                />
              </Link>
            </li>
          );
        })}
        {q && results.length === 0 && (
          <p className="py-10 text-center text-[12px] text-ink/40">
            No results — try fewer or different words.
          </p>
        )}
      </ul>
    </div>
  );
}
