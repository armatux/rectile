"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { relTime } from "@/lib/ui";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { src?: string; "camera-controls"?: string; "auto-rotate"?: string; exposure?: string };
    }
  }
}

export type FileDTO = {
  id: number;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  projectName?: string | null;
  projectSlug?: string | null;
};

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function kindOf(f: FileDTO): "model" | "image" | "audio" | "video" | "other" {
  const n = f.name.toLowerCase();
  if (n.endsWith(".glb") || n.endsWith(".gltf")) return "model";
  if (f.mime.startsWith("image/")) return "image";
  if (f.mime.startsWith("audio/")) return "audio";
  if (f.mime.startsWith("video/")) return "video";
  return "other";
}

/** Inline preview drawer: <model-viewer> for glb/gltf (3D orbit/zoom),
 *  native elements for image/audio/video. */
function Preview({ file }: { file: FileDTO }) {
  const kind = kindOf(file);
  const url = `/files/f/${file.id}`;
  const [mvReady, setMvReady] = useState(false);
  useEffect(() => {
    if (kind !== "model") return;
    void import("@google/model-viewer").then(() => setMvReady(true));
  }, [kind]);

  if (kind === "model") {
    if (!mvReady)
      return (
        <p className="py-6 text-center text-[12px] text-ink/40">
          Loading 3D viewer…
        </p>
      );
    /* model-viewer is a custom element — React renders it verbatim */
    return (
      <model-viewer
        src={url}
        camera-controls="true"
        auto-rotate="true"
        exposure="0.9"
        style={{ width: "100%", height: "340px", background: "rgb(10 10 15)", borderRadius: 12 }}
      />
    );
  }
  if (kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} className="max-h-[340px] w-auto max-w-full" />;
  if (kind === "audio") return <audio controls src={url} className="w-full" />;
  if (kind === "video")
    return <video controls src={url} className="max-h-[340px] w-full bg-black" />;
  return (
    <p className="py-4 text-center text-[12px] text-ink/40">
      No inline preview — download to open.
    </p>
  );
}

export function FilesPanel({
  files,
  projectSlug,
  showProject = false,
}: {
  files: FileDTO[];
  /** uploads attach to this project; omit for the global vault */
  projectSlug?: string;
  showProject?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setError(null);
      for (const file of Array.from(list)) {
        setBusy(file.name);
        try {
          const qs = new URLSearchParams({ name: file.name });
          if (projectSlug) qs.set("project", projectSlug);
          const res = await fetch(`/files/upload?${qs}`, {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "X-Rectile-Files": "1",
            },
            body: file,
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `HTTP ${res.status}`);
          }
        } catch (err) {
          setError(`${file.name}: ${String((err as Error)?.message ?? err)}`);
          break;
        }
      }
      setBusy(null);
      router.refresh();
    },
    [projectSlug, router],
  );

  const remove = useCallback(
    async (f: FileDTO) => {
      setBusy(f.name);
      try {
        await fetch("/files/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Rectile-Files": "1" },
          body: JSON.stringify({ id: f.id }),
        });
      } finally {
        setBusy(null);
        router.refresh();
      }
    },
    [router],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="hud-panel flex flex-col p-2">
        {files.length === 0 && (
          <p className="py-5 text-center text-[12px] text-ink/35">
            No files yet — upload something.
          </p>
        )}
        {files.map((f) => (
          <div key={f.id} className="border-b border-line/60 last:border-b-0">
            <div className="flex items-baseline gap-3 px-2 py-2.5">
              <button
                onClick={() => setOpenId(openId === f.id ? null : f.id)}
                className="min-w-0 flex-1 truncate text-left text-[13px] text-ink hover:text-bright"
                title={`${f.name} · sha256 preview`}
              >
                {f.name}
              </button>
              {showProject && f.projectSlug && (
                <span className="hidden flex-none text-[11px] text-ink/40 sm:inline">
                  {f.projectName}
                </span>
              )}
              <span className="flex-none text-[12px] tabular-nums text-ink/45">
                {fmtSize(f.size)}
              </span>
              <span className="hidden flex-none text-[12px] text-ink/35 sm:inline">
                {relTime(f.createdAt)}
              </span>
              <a
                href={`/files/f/${f.id}?dl=1`}
                className="flex-none text-[12px] text-ink/45 hover:text-accent"
                aria-label={`download ${f.name}`}
              >
                ↓
              </a>
              <button
                onClick={() => void remove(f)}
                className="flex-none px-1 text-[13px] text-ink/30 hover:text-danger"
                aria-label={`delete ${f.name}`}
              >
                ×
              </button>
            </div>
            {openId === f.id && (
              <div className="fade-in px-2 pb-3">
                <Preview file={f} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="btn-tint disabled:opacity-50"
        >
          {busy ? `Uploading ${busy.slice(0, 24)}…` : "Upload"}
        </button>
        <span className="text-[11px] text-ink/35">
          Max 500 MB · GLB/GLTF get a 3D preview
        </span>
        {error && <span className="text-[12px] text-danger">{error}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
