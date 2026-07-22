import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogFeed } from "@/components/LogFeed";
import { RoadmapBoard } from "@/components/RoadmapBoard";
import {
  LinksPanel,
  ProjectControls,
  TagEditor,
} from "@/components/SidePanels";
import {
  PriorityMark,
  SectionHeader,
  Staleness,
  StatusBadge,
} from "@/components/hud";
import {
  getProjectDetail,
  listTags,
  NotFoundError,
  type ProjectDetail,
} from "@/lib/repo";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function ProjectPage({ params }: { params: Params }) {
  const { slug } = await params;
  let project: ProjectDetail;
  try {
    project = await getProjectDetail(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const allTags = await listTags();

  const featureDTOs = project.features.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    status: f.status,
    sortOrder: f.sortOrder,
    completedAt: f.completedAt?.toISOString() ?? null,
  }));
  const logDTOs = project.logEntries.map((l) => ({
    id: l.id,
    body: l.body,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6 pt-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1
            className="font-display text-[24px] font-bold tracking-[0.04em] text-bright sm:text-[30px]"
            style={{ textShadow: "0 0 22px rgb(150 110 255 / 0.4)" }}
          >
            {project.name}
          </h1>
          <PriorityMark priority={project.priority} />
          <StatusBadge status={project.status} />
          <Staleness lastTouchedAt={project.lastTouchedAt} withLabel />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] tracking-[0.18em] text-ink/40">
          {project.category && <span>CAT · {project.category.toUpperCase()}</span>}
          <span>
            EST ·{" "}
            {new Date(project.createdAt)
              .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
              .toUpperCase()}
          </span>
          <span className="text-ink/25">/{project.slug}</span>
        </div>
        {project.description && (
          <p className="max-w-2xl text-[12px] leading-relaxed text-ink/65">
            {project.description}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-3">
            <SectionHeader label="ROADMAP" sub="BUILT.VS.PLANNED" />
            <RoadmapBoard slug={project.slug} initialFeatures={featureDTOs} />
          </div>
          <div className="flex flex-col gap-3">
            <SectionHeader label="LOG" sub="REVERSE.CHRONO" />
            <LogFeed slug={project.slug} initialLogs={logDTOs} />
          </div>
        </div>

        <aside className="flex flex-col gap-8">
          <ProjectControls
            slug={project.slug}
            status={project.status}
            priority={project.priority}
          />
          <TagEditor
            slug={project.slug}
            current={project.tags.map((t) => ({ name: t.name, color: t.color }))}
            all={allTags.map((t) => t.name)}
          />
          <LinksPanel slug={project.slug} links={project.links} />
        </aside>
      </div>
    </div>
  );
}
