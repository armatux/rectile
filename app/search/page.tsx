import Link from "next/link";
import { SectionHeader } from "@/components/hud";
import { search } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata = { title: "search" };

const KIND_META: Record<string, { label: string; color: string }> = {
  project: { label: "PROJECT", color: "var(--color-accent)" },
  feature: { label: "FEATURE", color: "var(--color-ok)" },
  log_entry: { label: "LOG", color: "var(--color-cyan)" },
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
        label="SEARCH"
        sub={q ? `"${q.toUpperCase()}" · ${results.length} HITS` : "AWAITING QUERY"}
      />
      {!q && (
        <p className="text-[11px] text-ink/40">
          type a query in the search bar above — full-text across projects,
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
                className="group flex min-h-[56px] flex-col justify-center gap-1 border-b border-line/60 py-3 hover:bg-accent/5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="border border-line px-1.5 py-0.5 text-[8px] font-bold tracking-[0.2em]"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[12px] font-bold tracking-[0.04em] text-bright group-hover:text-accent">
                    {r.title}
                  </span>
                  <span className="text-[9px] tracking-[0.14em] text-ink/35">
                    {r.projectName.toUpperCase()}
                  </span>
                </div>
                <p
                  className="hit text-[11px] leading-relaxed text-ink/60"
                  dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
                />
              </Link>
            </li>
          );
        })}
        {q && results.length === 0 && (
          <p className="py-10 text-center text-[11px] tracking-[0.2em] text-ink/40">
            ZERO HITS · TRY FEWER OR DIFFERENT WORDS
          </p>
        )}
      </ul>
    </div>
  );
}
