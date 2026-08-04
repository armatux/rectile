import Link from "next/link";
import { ProjectCard } from "@/components/ProjectCard";
import { SectionHeader } from "@/components/hud";
import { listProjects } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata = { title: "archive" };

/** Cold storage — the only place archived projects appear. */
export default async function ArchivePage() {
  const archived = (await listProjects({ sort: "updated" })).filter(
    (p) => p.status === "archived",
  );

  return (
    <div className="flex flex-col gap-5 pt-5">
      <div className="flex items-center gap-3">
        <SectionHeader
          label="Archive"
          sub={`${archived.length} project${archived.length === 1 ? "" : "s"}`}
        />
        <Link
          href="/"
          className="ml-auto text-[12px] font-medium text-ink/50 hover:text-accent"
        >
          ‹ Back
        </Link>
      </div>
      <p className="-mt-2 text-[12px] text-ink/50">
        Archived projects live here and nowhere else — set a project&apos;s
        status back to anything active and it returns to the grid.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {archived.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {archived.length === 0 && (
          <p className="col-span-full py-10 text-center text-[12px] text-ink/40">
            Nothing archived yet.
          </p>
        )}
      </div>
    </div>
  );
}
