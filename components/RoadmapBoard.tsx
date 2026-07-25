"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitOp } from "@/lib/offline/queue";
import { FEATURE_STATUS_META } from "@/lib/ui";
import { ProgressBar } from "./hud";

export type FeatureDTO = {
  id: number;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "built";
  sortOrder: number;
  completedAt: string | null;
};

type Status = FeatureDTO["status"];
const CYCLE: Record<Status, Status> = {
  planned: "in_progress",
  in_progress: "built",
  built: "planned",
};

const COLUMNS: { status: Status; title: string; hint: string }[] = [
  { status: "in_progress", title: "IN PROGRESS", hint: "DOING" },
  { status: "planned", title: "PLANNED", hint: "QUEUE" },
  { status: "built", title: "BUILT", hint: "DONE" },
];

/* Desktop shows PLANNED → IN PROGRESS → BUILT left-to-right;
   mobile stacks IN PROGRESS first (it's what you came back for). */
const DESKTOP_ORDER: Record<Status, string> = {
  planned: "md:order-1",
  in_progress: "md:order-2",
  built: "md:order-3",
};

function byOrder(a: FeatureDTO, b: FeatureDTO) {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

export function RoadmapBoard({
  slug,
  initialFeatures,
}: {
  slug: string;
  initialFeatures: FeatureDTO[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [features, setFeatures] = useState(initialFeatures);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [justBuilt, setJustBuilt] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<Status, boolean>>({
    planned: false,
    in_progress: false,
    built: true,
  });
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  function saveEdit(id: number) {
    const title = editTitle.trim();
    setEditId(null);
    if (!title || features.find((f) => f.id === id)?.title === title) return;
    setFeatures((fs) => fs.map((f) => (f.id === id ? { ...f, title } : f)));
    startTransition(async () => {
      if (await submitOp({ kind: "feature.update", slug, id, patch: { title } })) {
        router.refresh();
      }
    });
  }

  useEffect(() => setFeatures(initialFeatures), [initialFeatures]);

  const built = features.filter((f) => f.status === "built").length;
  const total = features.length;

  function markBuilt(id: number) {
    setJustBuilt((s) => new Set(s).add(id));
    setTimeout(
      () =>
        setJustBuilt((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        }),
      900,
    );
  }

  function applyMove(id: number, status: Status, orderedIds?: number[]) {
    setFeatures((fs) => {
      const next = fs.map((f) => (f.id === id ? { ...f, status } : f));
      if (orderedIds) {
        const pos = new Map(orderedIds.map((fid, i) => [fid, i + 1]));
        return next.map((f) =>
          f.status === status && pos.has(f.id)
            ? { ...f, sortOrder: pos.get(f.id)! }
            : f,
        );
      }
      const max = Math.max(0, ...fs.filter((f) => f.status === status).map((f) => f.sortOrder));
      return next.map((f) => (f.id === id ? { ...f, sortOrder: max + 1 } : f));
    });
    if (status === "built") markBuilt(id);
    startTransition(async () => {
      if (await submitOp({ kind: "feature.move", slug, id, status, orderedIds })) {
        router.refresh();
      }
    });
  }

  function cycle(f: FeatureDTO) {
    applyMove(f.id, CYCLE[f.status]);
  }

  function handleDrop(e: React.DragEvent, status: Status) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/plain") || dragId);
    setDragId(null);
    if (!id) return;
    const container = e.currentTarget.querySelector("[data-col-body]");
    const cards = [...(container?.querySelectorAll("[data-fid]") ?? [])] as HTMLElement[];
    const remaining = cards
      .map((c) => Number(c.dataset.fid))
      .filter((fid) => fid !== id);
    let insertAt = remaining.length;
    for (let i = 0; i < cards.length; i++) {
      const fid = Number(cards[i].dataset.fid);
      if (fid === id) continue;
      const rect = cards[i].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        insertAt = remaining.indexOf(fid);
        break;
      }
    }
    remaining.splice(insertAt, 0, id);
    applyMove(id, status, remaining);
  }

  function addFeature(status: Status, title: string) {
    const temp: FeatureDTO = {
      id: -Date.now(),
      title,
      description: null,
      status,
      sortOrder: Math.max(0, ...features.filter((f) => f.status === status).map((f) => f.sortOrder)) + 1,
      completedAt: status === "built" ? new Date().toISOString() : null,
    };
    setFeatures((fs) => [...fs, temp]);
    startTransition(async () => {
      // temp card stays until fresh server data replaces it (or the queue flushes)
      if (await submitOp({ kind: "feature.add", slug, title, status, tempId: temp.id })) {
        router.refresh();
      }
    });
  }

  function requestDelete(id: number) {
    if (pendingDelete === id) {
      clearTimeout(deleteTimer.current);
      setPendingDelete(null);
      setFeatures((fs) => fs.filter((f) => f.id !== id));
      startTransition(async () => {
        if (await submitOp({ kind: "feature.delete", slug, id })) router.refresh();
      });
    } else {
      setPendingDelete(id);
      clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setPendingDelete(null), 2500);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {/* progress header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-[44px] font-bold leading-none text-bright sm:text-[56px]"
            style={{ textShadow: "0 0 30px rgb(150 110 255 / 0.45)" }}
          >
            {built}
            <span className="text-ink/40"> / {total}</span>
          </span>
          <span className="text-[11px] font-medium tracking-[0.3em] text-ink/55">
            BUILT
          </span>
        </div>
        <ProgressBar built={built} total={total} height={4} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const meta = FEATURE_STATUS_META[col.status];
          const items = features.filter((f) => f.status === col.status).sort(byOrder);
          const isCollapsed = collapsed[col.status];
          return (
            <div
              key={col.status}
              className={`hud-panel flex flex-col p-3 ${DESKTOP_ORDER[col.status]} ${
                dragOver === col.status ? "drag-over" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
              }}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <button
                className="flex min-h-[44px] w-full items-center gap-2 text-left"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [col.status]: !c[col.status] }))
                }
                aria-expanded={!isCollapsed}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}` }}
                  aria-hidden
                />
                <span className="text-[10px] font-bold tracking-[0.24em] text-bright">
                  {col.title}
                </span>
                <span className="hud-sublabel">{String(items.length).padStart(2, "0")}</span>
                <div className="hud-rule" />
                <span className="text-[10px] text-ink/40 md:hidden">
                  {isCollapsed ? "▸" : "▾"}
                </span>
              </button>

              <div
                data-col-body
                className={`flex flex-col gap-1.5 ${isCollapsed ? "max-md:hidden" : ""}`}
              >
                {items.map((f) => (
                  <div
                    key={f.id}
                    data-fid={f.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(f.id));
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(f.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={`group flex min-h-[44px] items-center gap-1 border border-line bg-void/40 pl-1 pr-1 transition-colors hover:border-line-strong ${
                      dragId === f.id ? "opacity-40" : ""
                    } ${justBuilt.has(f.id) ? "built-pop" : ""}`}
                  >
                    <button
                      onClick={() => cycle(f)}
                      className="flex h-11 w-9 flex-none cursor-pointer items-center justify-center"
                      title={`→ ${FEATURE_STATUS_META[CYCLE[f.status]].label}`}
                      aria-label={`cycle status, currently ${meta.label}`}
                    >
                      <span
                        className="h-2 w-2 rounded-full border transition-transform group-hover:scale-125"
                        style={{
                          borderColor: meta.color,
                          background: f.status === "built" ? meta.color : "transparent",
                          boxShadow: f.status !== "planned" ? `0 0 6px ${meta.color}` : "none",
                        }}
                      />
                    </button>
                    <div className="min-w-0 flex-1 cursor-grab py-2 active:cursor-grabbing">
                      {editId === f.id ? (
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => saveEdit(f.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(f.id);
                            if (e.key === "Escape") setEditId(null);
                          }}
                          maxLength={300}
                          autoFocus
                          className="w-full border-b border-line-strong bg-transparent text-[11.5px] leading-snug text-bright focus:outline-none"
                        />
                      ) : (
                        <p
                          onDoubleClick={() => {
                            setEditId(f.id);
                            setEditTitle(f.title);
                          }}
                          title="double-click to edit"
                          className={`text-[11.5px] leading-snug ${
                            f.status === "built" ? "text-ink/50" : "text-ink"
                          }`}
                        >
                          {f.title}
                        </p>
                      )}
                      {f.description && (
                        <p className="mt-0.5 truncate text-[9.5px] text-ink/35">{f.description}</p>
                      )}
                      {f.status === "built" && f.completedAt && (
                        <p className="mt-0.5 text-[8.5px] tracking-[0.14em] text-ok/50">
                          ✓ {new Date(f.completedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setEditId(f.id);
                        setEditTitle(f.title);
                      }}
                      className="flex h-11 w-7 flex-none items-center justify-center text-[10px] text-ink/25 transition-colors hover:text-accent md:opacity-0 md:group-hover:opacity-100"
                      aria-label="edit feature title"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => requestDelete(f.id)}
                      className={`flex h-11 w-9 flex-none items-center justify-center text-[11px] transition-colors ${
                        pendingDelete === f.id
                          ? "text-danger"
                          : "text-ink/25 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
                      }`}
                      aria-label="delete feature"
                    >
                      {pendingDelete === f.id ? "SURE?" : "×"}
                    </button>
                  </div>
                ))}

                <AddInline
                  onAdd={(title) => addFeature(col.status, title)}
                  color={meta.color}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddInline({
  onAdd,
  color,
}: {
  onAdd: (title: string) => void;
  color: string;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        onAdd(v);
        setValue("");
      }}
      className="flex items-center gap-2 border border-transparent px-1 focus-within:border-line"
    >
      <span className="text-[11px]" style={{ color }} aria-hidden>
        +
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="add"
        enterKeyHint="done"
        className="min-h-[44px] w-full bg-transparent text-[11.5px] text-bright placeholder:text-ink/25 focus:outline-none"
      />
    </form>
  );
}
