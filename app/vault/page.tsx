import { SectionHeader } from "@/components/hud";
import { FilesPanel, type FileDTO } from "@/components/FilesPanel";
import { listFiles } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "vault" };

export default async function VaultPage() {
  const files = await listFiles();
  const dtos: FileDTO[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    mime: f.mime,
    size: f.size,
    createdAt: f.createdAt.toISOString(),
    projectName: f.projectName,
    projectSlug: f.projectSlug,
  }));
  const total = files.reduce((s, f) => s + f.size, 0);
  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader
        label="VAULT"
        sub={`FILES.${String(files.length).padStart(2, "0")} · ${(total / 1024 / 1024).toFixed(1)} MB`}
      />
      <FilesPanel files={dtos} showProject />
    </div>
  );
}
