import { SectionHeader } from "@/components/hud";
import { ShareForm } from "@/components/ShareForm";
import { listProjectSlugs } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata = { title: "share" };

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Web Share Target landing page — also usable directly as a quick-capture. */
export default async function SharePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;
  const projects = await listProjectSlugs();

  return (
    <div className="flex flex-col gap-5 pt-5">
      <SectionHeader label="Capture" sub="Share target" />
      <ShareForm
        sharedTitle={str(sp.title)}
        sharedText={str(sp.text)}
        sharedUrl={str(sp.url)}
        projects={projects.map((p) => ({ slug: p.slug, name: p.name }))}
      />
    </div>
  );
}
