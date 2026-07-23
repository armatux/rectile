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
          label="ARCHIVE"
          sub={`COLD.STORAGE · ${String(archived.length).padStart(2, "0")}`}
        />
        <Link
          href="/"
          className="ml-auto text-[9px] font-bold tracking-[0.22em] text-ink/40 hover:text-accent"
        >
          ◂ BACK TO GRID
        </Link>
      </div>
      <p className="-mt-3 text-[10px] tracking-[0.08em] text-ink/40">
        archived projects live here and nowhere else — set a project&apos;s
        status back to anything active and it returns to the grid.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {archived.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {archived.length === 0 && (
          <p className="col-span-full py-10 text-center text-[11px] tracking-[0.2em] text-ink/40">
            ARCHIVE EMPTY · NOTHING ON ICE
          </p>
        )}
      </div>
    </div>
  );
}
