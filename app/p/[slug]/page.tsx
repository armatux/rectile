import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsPanel, type DocDTO } from "@/components/DocsPanel";
import { FilesPanel, type FileDTO } from "@/components/FilesPanel";
import { LogFeed } from "@/components/LogFeed";
import { ProjectIdentity } from "@/components/ProjectIdentity";
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
import { renderMarkdown } from "@/lib/markdown";
import {
  getProjectDetail,
  listDocs,
  listFiles,
  listProjectReminders,
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
  const [allTags, reminders, docs, projFiles] = await Promise.all([
    listTags(),
    listProjectReminders(project.id),
    listDocs(project.id),
    listFiles(project.id),
  ]);
  const docDTOs: DocDTO[] = docs.map((d) => ({
    id: d.id,
    title: d.title,
    body: d.body,
    updatedAt: d.updatedAt.toISOString(),
  }));
  const renderedById = Object.fromEntries(docs.map((d) => [d.id, renderMarkdown(d.body)]));
  const fileDTOs: FileDTO[] = projFiles.map((f) => ({
    id: f.id,
    name: f.name,
    mime: f.mime,
    size: f.size,
    createdAt: f.createdAt.toISOString(),
  }));

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
        <ProjectIdentity
          slug={project.slug}
          name={project.name}
          description={project.description}
          category={project.category}
        >
          <PriorityMark priority={project.priority} />
          <StatusBadge status={project.status} />
          <Staleness lastTouchedAt={project.lastTouchedAt} withLabel />
        </ProjectIdentity>
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
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-3">
            <SectionHeader label="ROADMAP" sub="BUILT.VS.PLANNED" />
            <RoadmapBoard slug={project.slug} initialFeatures={featureDTOs} />
          </div>
          <div className="flex flex-col gap-3">
            <SectionHeader
              label="DOCS"
              sub={`PAGES.${String(docDTOs.length).padStart(2, "0")}`}
            />
            <DocsPanel slug={project.slug} docs={docDTOs} renderedById={renderedById} />
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
          <div className="flex flex-col gap-2">
            <SectionHeader
              label="FILES"
              sub={`VAULT.${String(fileDTOs.length).padStart(2, "0")}`}
            />
            <FilesPanel files={fileDTOs} projectSlug={project.slug} />
          </div>
          {reminders.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader
                label="REMINDERS"
                sub={`OPEN.${String(reminders.length).padStart(2, "0")}`}
              />
              <div className="hud-panel flex flex-col gap-1 p-3">
                {reminders.map((r) => {
                  const overdue = r.dueAt !== null && r.dueAt < new Date();
                  return (
                    <Link
                      key={r.id}
                      href="/reminders"
                      className="flex min-h-[32px] items-center gap-2 text-[11px] text-ink hover:text-bright"
                    >
                      <span className="text-[10px]" aria-hidden>
                        {r.repeat ? "↻" : "▹"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      {r.dueAt && (
                        <span
                          className="flex-none text-[9px] font-bold tabular-nums"
                          style={{
                            color: overdue
                              ? "var(--color-danger)"
                              : "var(--color-accent)",
                          }}
                        >
                          {r.dueAt
                            .toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })
                            .toUpperCase()}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
