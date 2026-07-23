import { CpptutorWidget, type CpptutorProgress } from "@/components/CpptutorWidget";
import { DueSoon } from "@/components/DueSoon";
import { FilterBar, type DashboardParams } from "@/components/FilterBar";
import { PrecachePing } from "@/components/PrecachePing";
import { NewProjectForm } from "@/components/NewProjectForm";
import { Orb } from "@/components/Orb";
import { ProjectCard } from "@/components/ProjectCard";
import { VitalsBar } from "@/components/Vitals";
import { SectionHeader } from "@/components/hud";
import {
  getKv,
  getVitals,
  listOpenRemindersDue,
  listProjects,
  type ListProjectsOpts,
} from "@/lib/repo";
import { PROJECT_STATUSES } from "@/db/schema";
import { listTags } from "@/lib/repo";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const params: DashboardParams = {
    status: typeof sp.status === "string" ? sp.status : undefined,
    tag: typeof sp.tag === "string" ? sp.tag : undefined,
    sort: typeof sp.sort === "string" ? sp.sort : undefined,
  };
  const validStatus = PROJECT_STATUSES.find((s) => s === params.status);
  const [all, tags, tutor, dueSoon] = await Promise.all([
    listProjects({ sort: (params.sort as ListProjectsOpts["sort"]) ?? "staleness" }),
    listTags(),
    getKv<CpptutorProgress>("cpptutor_progress"),
    listOpenRemindersDue(new Date(Date.now() + 7 * 86_400_000)),
  ]);
  const vitals = await getVitals(all);
  const filtered = all.filter((p) => {
    if (validStatus && p.status !== validStatus) return false;
    if (
      params.tag &&
      !p.tags.some((t) => t.name.toLowerCase() === params.tag!.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="relative flex flex-col gap-6 pt-5">
      <Orb />
      <PrecachePing
        urls={[
          "/",
          "/stale",
          "/offline",
          "/cpptutor",
          "/calendar",
          "/reminders",
          "/review",
          "/share",
          ...all.map((p) => `/p/${p.slug}`),
        ]}
      />
      <SectionHeader label="SYSTEM VITALS" sub="PORTFOLIO.LINK" />
      <VitalsBar vitals={vitals} />

      {dueSoon.length > 0 && (
        <>
          <SectionHeader
            label="DUE SOON"
            sub={`REMINDERS.${String(dueSoon.length).padStart(2, "0")} · 7D`}
          />
          <DueSoon items={dueSoon.slice(0, 6)} />
        </>
      )}

      {tutor && (
        <>
          <SectionHeader label="TRAINING UPLINK" sub="CPPTUTOR.SYNC" />
          <CpptutorWidget data={tutor.value} updatedAt={tutor.updatedAt} />
        </>
      )}

      <SectionHeader
        label="PROJECT GRID"
        sub={`ROSTER.${String(filtered.length).padStart(2, "0")}`}
      />
      <FilterBar params={params} tags={tags} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-[11px] tracking-[0.2em] text-ink/40">
            NO PROJECTS MATCH · ADJUST FILTERS OR INITIALIZE ONE
          </p>
        )}
      </div>

      <div className="flex">
        <NewProjectForm />
      </div>
    </div>
  );
}
