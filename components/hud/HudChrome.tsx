"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HudChromeData, HudProject, LauncherApp } from "@/lib/hud-types";
import { submitOp } from "@/lib/offline/queue";
import { PROJECT_STATUS_META, STALENESS_META, relTime } from "@/lib/ui";
import { Sparkline } from "@/components/hud";
import { OrbCanvas, type OrbBus } from "./OrbCanvas";
import { VoiceDock } from "./VoiceDock";
import { VOICE_COLOR, type VoiceState } from "./voice";

export type HudMode = "core" | "cal" | "mail";

/* pin slots: fraction of the content area (x), viewport height (y), parallax depth */
const SLOTS = [
  { fx: 0.2, y: "17%", d: 0.7 },
  { fx: 0.8, y: "14%", d: 1.1 },
  { fx: 0.22, y: "62%", d: 1.0 },
  { fx: 0.78, y: "70%", d: 0.6 },
];

const PIN_KEY = "hud_pinned";
const SEL_KEY = "hud_sel";

function Clock() {
  const [time, setTime] = useState("--:--");
  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().slice(0, 5));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-[12px] font-medium text-ink/70 tabular-nums">
      {time}
    </span>
  );
}

function LinkStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink/60">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: online ? "var(--color-ok)" : "var(--color-warn)" }}
        aria-hidden
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}

function SectionRule({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="hud-label">{label}</span>
      {sub && <span className="hud-sublabel">{sub}</span>}
      <div className="hud-rule self-center" />
    </div>
  );
}

function SideStat({
  label,
  value,
  note,
  noteColor,
  spark,
}: {
  label: string;
  value: string;
  note?: string;
  noteColor?: string;
  spark?: number[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 truncate text-[11px] font-medium text-ink/55">
          {label}
        </span>
        {note && (
          <span
            className="truncate text-[11px]"
            style={{ color: noteColor ?? "rgb(235 235 245 / 0.35)" }}
          >
            {note}
          </span>
        )}
      </div>
      <span className="font-display text-[30px] font-semibold leading-none tracking-[-0.02em] text-bright tabular-nums">
        {value}
      </span>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function TrainingUplink({ tutor }: { tutor: NonNullable<HudChromeData["tutor"]> }) {
  const d = tutor.data;
  const span = Math.max(1, d.xp_level_next - d.xp_level_floor);
  const into = Math.max(0, d.xp_lifetime - d.xp_level_floor);
  return (
    <Link href="/cpptutor" className="group flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-bright">
          L{d.level}
          {d.prestige > 0 && <span className="text-[13px] text-accent"> ✦{d.prestige}</span>}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-bright/90 group-hover:text-bright">
            {d.title}
          </span>
          <span className="text-[11px] text-ink/50 tabular-nums">
            {d.xp} XP{d.streak > 0 && ` · ${d.streak}-day streak`}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-ink/45">
            Level {d.level} → {d.level + 1}
          </span>
          <span className="text-[11px] font-medium text-ink/70 tabular-nums">
            {into} / {span} XP
          </span>
        </div>
        <Bar pct={(into / span) * 100} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-ink/45">Lessons</span>
          <span className="text-[11px] font-medium text-ink/70 tabular-nums">
            {d.done} / {d.total}
          </span>
        </div>
        <Bar pct={d.total ? (d.done / d.total) * 100 : 0} />
      </div>
      <span className="truncate text-[12px] text-ink/55">
        <span className="text-ink/40">Next: </span>
        {d.next_lesson ? `${d.next_lesson} · ${d.next_module}` : "all lessons complete"}
      </span>
    </Link>
  );
}

/** Editable quick-launch grid, stored in kv "app_launcher" via the ops queue. */
function LauncherSection({ apps }: { apps: LauncherApp[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(apps.map((a) => `${a.label} | ${a.url}`).join("\n"));
    setEditing(true);
  }

  function save() {
    const parsed: LauncherApp[] = draft
      .split("\n")
      .map((line) => {
        const [label, ...rest] = line.split("|");
        const url = rest.join("|").trim();
        return { label: (label ?? "").trim(), url };
      })
      .filter((a) => a.label && a.url)
      .slice(0, 24)
      .map((a) => ({
        label: a.label.slice(0, 40),
        url: /^https?:\/\//.test(a.url) ? a.url : `https://${a.url}`,
      }));
    setEditing(false);
    void submitOp({ kind: "kv.set", key: "app_launcher", value: parsed }).then(
      (d) => d && router.refresh(),
    );
  }

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="hud-label">Apps</span>
        <span className="hud-sublabel">{apps.length}</span>
        <div className="hud-rule self-center" />
        <button
          onClick={editing ? () => setEditing(false) : startEdit}
          className="text-[12px] text-ink/45 transition-colors hover:text-accent"
          aria-label="edit launcher"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(4, draft.split("\n").length + 1)}
            placeholder={"Label | https://url\nProxmox | https://192.168.1.190:8006"}
            autoFocus
            className="field resize-y py-2 font-mono text-[12px] leading-relaxed"
          />
          <button onClick={save} className="btn-tint w-fit">
            Save
          </button>
        </div>
      ) : apps.length === 0 ? (
        <button
          onClick={startEdit}
          className="text-[12px] text-ink/40 transition-colors hover:text-accent"
        >
          + Add your apps (one “Label | URL” per line)
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {apps.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[38px] items-center rounded-xl bg-white/5 px-3 text-[12px] font-medium text-ink/75 transition-colors hover:bg-white/10 hover:text-bright"
              title={a.url}
            >
              <span className="min-w-0 truncate">{a.label}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return;
    const tagsRaw = String(fd.get("tags") ?? "");
    onClose();
    void submitOp({
      kind: "project.create",
      name,
      description: String(fd.get("description") ?? "").trim() || undefined,
      category: String(fd.get("category") ?? "").trim() || undefined,
      priority: Number(fd.get("priority") ?? 2),
      tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    }).then(() => router.refresh());
  }
  return (
    <div
      className="fixed inset-0 z-[28] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="glass-heavy fade-in flex w-[min(440px,90%)] flex-col gap-2.5 p-5"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-bright">
            New project
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-[13px] text-ink/60 transition-colors hover:bg-white/15 hover:text-bright"
          >
            ✕
          </button>
        </div>
        <input name="name" required maxLength={200} placeholder="Name" className="field" autoFocus />
        <textarea
          name="description"
          placeholder="Description (optional)"
          rows={2}
          className="field resize-none py-2.5"
        />
        <div className="flex gap-2">
          <input name="category" placeholder="Category" className="field min-w-0 flex-1" />
          <select
            name="priority"
            defaultValue="2"
            className="field w-24 flex-none appearance-none"
          >
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
          </select>
        </div>
        <input name="tags" placeholder="Tags, comma, separated" className="field" />
        <button type="submit" className="btn-tint mt-1 min-h-[44px]">
          Create
        </button>
      </form>
    </div>
  );
}

/** Full-screen HUD frame: fixed sidebar + topline + voice dock on desktop,
 *  a stacked scrolling column on phone/tablet. mode="core" renders the orb
 *  stage; "cal"/"mail" render the page content in the panel area. */
export function HudChrome({
  data,
  mode,
  children,
}: {
  data: HudChromeData;
  mode: HudMode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const tracked = data.projects.filter((p) => p.status !== "done");
  const defaultPins = tracked.slice(0, 4).map((p) => p.slug);
  const [selSlug, setSelSlug] = useState<string | null>(tracked[0]?.slug ?? null);
  const [pinned, setPinned] = useState<string[]>(defaultPins);
  const [hydrated, setHydrated] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [newOpen, setNewOpen] = useState(false);
  const [doneTicks, setDoneTicks] = useState<Record<number, boolean>>({});

  const bus = useRef<OrbBus>({ analyser: null, tags: {} });

  /* restore pin/selection state after mount (SSR-safe) */
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PIN_KEY) ?? "null");
      if (Array.isArray(p))
        setPinned(p.filter((s: unknown) => typeof s === "string").slice(0, 4));
      const s = localStorage.getItem(SEL_KEY);
      if (s && data.projects.some((x) => x.slug === s)) setSelSlug(s);
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem(PIN_KEY, JSON.stringify(pinned));
  }, [pinned, hydrated]);
  useEffect(() => {
    if (hydrated && selSlug) localStorage.setItem(SEL_KEY, selSlug);
  }, [selSlug, hydrated]);

  const select = useCallback(
    (p: HudProject) => {
      if (mode === "core") {
        setSelSlug(p.slug);
        setPinned((prev) => (prev.includes(p.slug) ? prev : [p.slug, ...prev].slice(0, 4)));
      } else {
        router.push(`/p/${p.slug}`);
      }
    },
    [mode, router],
  );

  const toggleDirective = useCallback(
    (p: HudProject) => {
      if (!p.nextActionFeatureId) return;
      const id = p.nextActionFeatureId;
      const was = !!doneTicks[id];
      setDoneTicks((prev) => ({ ...prev, [id]: !was }));
      void submitOp({
        kind: "feature.move",
        slug: p.slug,
        id,
        status: was ? "in_progress" : "built",
      }).then((delivered) => {
        if (delivered && !was) router.refresh();
      });
    },
    [doneTicks, router],
  );

  /** voice command grammar: returns spoken ack when a command was executed */
  const interpret = useCallback(
    (tx: string): string | null => {
      const t = tx.toLowerCase();
      if (/\b(calendar|cal)\b/.test(t)) {
        router.push("/calendar");
        return "Opening calendar.";
      }
      if (/\bmail\b/.test(t)) {
        router.push("/mail");
        return "Opening mail.";
      }
      if (/\b(core|home|dashboard)\b/.test(t)) {
        router.push("/");
        return "Core view.";
      }
      if (/\b(vault|files)\b/.test(t)) {
        router.push("/vault");
        return "Opening the vault.";
      }
      if (/\breminders\b/.test(t)) {
        router.push("/reminders");
        return "Opening reminders.";
      }
      const open = /\b(?:open|select|show)\s+(.+)/.exec(t);
      if (open) {
        const needle = open[1].trim();
        const hit = data.projects.find((p) => p.name.toLowerCase().includes(needle));
        if (hit) {
          if (mode === "core") setSelSlug(hit.slug);
          else router.push(`/p/${hit.slug}`);
          return `${hit.name}. ${hit.pct} percent complete, ${
            hit.idleDays === 0 ? "touched today" : `idle ${hit.idleDays} days`
          }.`;
        }
      }
      return null; // fall through to the regular brief
    },
    [data.projects, mode, router],
  );

  const sel =
    data.projects.find((p) => p.slug === selSlug) ?? tracked[0] ?? data.projects[0];
  const pins = pinned
    .map((slug, i) => {
      const p = data.projects.find((q) => q.slug === slug);
      return p ? { p, slot: SLOTS[i % SLOTS.length] } : null;
    })
    .filter(Boolean) as { p: HudProject; slot: (typeof SLOTS)[number] }[];

  const directives = tracked.filter((p) => p.nextAction).slice(0, 3);
  const upcoming4 = data.upcoming.slice(0, 4);
  const doneCount = data.projects.length - tracked.length;

  const topLink = (href: string, active: boolean, label: ReactNode) => (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
        active ? "bg-white/10 text-bright" : "text-ink/60 hover:text-bright"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-8 lg:block">
      {/* ---- mobile brand ---- */}
      <div className="safe-top order-0 flex items-baseline gap-1 pt-3 lg:hidden">
        <Link href="/" className="text-[22px] font-semibold tracking-[-0.02em] text-bright">
          Scala
        </Link>
      </div>

      {/* ---- topline ---- */}
      <div className="safe-top order-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 pt-2 lg:fixed lg:left-[330px] lg:right-4 lg:top-[14px] lg:z-10 lg:pt-0">
        {topLink("/", mode === "core", <>Home · {data.vitals.hotCount} stale</>)}
        {topLink("/calendar", mode === "cal", <>Calendar · {data.upcoming.length}</>)}
        {topLink(
          "/mail",
          mode === "mail",
          <>Mail{data.mailUnread === null ? "" : ` · ${data.mailUnread}`}</>,
        )}
        <LinkStatus />
        <span className="whitespace-nowrap text-[12px] text-ink/60">
          <span style={{ color: VOICE_COLOR[voice] }}>
            {voice === "idle" ? "Voice ready" : voice === "listening" ? "Listening…" : "Responding"}
          </span>
        </span>
        <Clock />
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => history.back()}
            aria-label="back"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-[12px] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright"
          >
            ‹
          </button>
          <button
            onClick={() => history.forward()}
            aria-label="forward"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-[12px] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright"
          >
            ›
          </button>
          <button
            onClick={() => location.reload()}
            aria-label="reload"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-[12px] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright"
          >
            ↻
          </button>
        </span>
      </div>

      {/* ---- core stage ---- */}
      {mode === "core" && (
        <div className="order-2 lg:contents">
          <OrbCanvas
            bus={bus}
            voice={voice}
            className="pointer-events-none relative mx-auto h-[min(340px,48vh)] w-[min(340px,48vh)] lg:fixed lg:left-[calc(330px+(100%-330px)*0.5)] lg:top-[46%] lg:mx-0 lg:h-[min(620px,82vh)] lg:w-[min(620px,82vh)] lg:-translate-x-1/2 lg:-translate-y-1/2"
          />

          {/* pinned tags (desktop only) */}
          {hydrated && pins.length > 0 && (
            <button
              onClick={() => {
                bus.current.tags = {};
                setPinned([]);
              }}
              className="glass fixed top-[48px] z-[12] hidden -translate-x-1/2 whitespace-nowrap px-4 py-1.5 text-[12px] font-medium text-ink/70 transition-colors hover:text-bright lg:block"
              style={{ left: "calc(330px + (100% - 330px)*0.5)", borderRadius: 999 }}
            >
              Clear all ({pins.length})
            </button>
          )}
          {hydrated &&
            pins.map(({ p, slot }) => (
              <div
                key={p.slug}
                ref={(el) => {
                  bus.current.tags[p.slug] = { el, d: slot.d };
                }}
                className="glass fixed z-[11] hidden min-w-[190px] max-w-[240px] -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 px-3.5 py-2.5 will-change-transform lg:flex"
                style={{ left: `calc(330px + (100% - 330px)*${slot.fx})`, top: slot.y }}
              >
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: PROJECT_STATUS_META[p.status].color }}
                  aria-hidden
                />
                <button
                  onClick={() => setSelSlug(p.slug)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                >
                  <span className="truncate text-[13px] font-medium text-bright">
                    {p.name}
                  </span>
                  <span className="truncate text-[11px] text-ink/50">
                    {p.idleDays === 0 ? "touched today" : `${p.idleDays}d idle`} ·{" "}
                    {PROJECT_STATUS_META[p.status].label.toLowerCase()}
                  </span>
                </button>
                <button
                  onClick={() => {
                    delete bus.current.tags[p.slug];
                    setPinned((prev) => prev.filter((s) => s !== p.slug));
                  }}
                  aria-label={`unpin ${p.name}`}
                  className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] text-ink/40 transition-colors hover:bg-white/10 hover:text-bright"
                >
                  ✕
                </button>
              </div>
            ))}

          {/* focus card */}
          {sel && (
            <div className="z-[15] mx-auto flex w-full max-w-[660px] flex-col items-center gap-2 lg:fixed lg:bottom-[14px] lg:left-[calc(330px+(100%-330px)*0.5)] lg:w-[min(660px,calc((100%-330px)*0.92))] lg:-translate-x-1/2">
              <Link
                href={`/p/${sel.slug}`}
                className="max-w-full truncate whitespace-nowrap text-[12px] font-medium text-ink/55 transition-colors hover:text-bright"
              >
                Focus · {sel.name} ›
              </Link>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[clamp(44px,9vh,72px)] font-semibold leading-none tracking-[-0.03em] text-bright tabular-nums">
                  {sel.pct}%
                </span>
                <span className="text-[13px] font-medium text-ink/50">
                  complete
                </span>
              </div>
              <div className="w-[min(420px,80%)]">
                <Bar pct={sel.pct} />
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-x-5 gap-y-1 whitespace-nowrap">
                <Stat k="Built" v={`${sel.built}/${sel.total}`} />
                <Stat
                  k="Touched"
                  v={sel.idleDays === 0 ? "today" : `${sel.idleDays}d ago`}
                  c={sel.tier === "fresh" ? "#f5f5f7" : STALENESS_META[sel.tier].color}
                />
                <Stat k="Age" v={`${sel.ageDays}d`} />
                <Stat
                  k="Status"
                  v={PROJECT_STATUS_META[sel.status].label}
                  c={PROJECT_STATUS_META[sel.status].color}
                />
                <Stat k="Priority" v={`P${sel.priority}`} />
              </div>
              <div className="max-w-full truncate text-[12px] text-ink/55">
                <span className="text-ink/40">Next: </span>
                {sel.nextAction ?? "no open features — add the next move"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- cal / mail panel area ---- */}
      {mode !== "core" && (
        <div className="order-2 lg:fixed lg:bottom-[86px] lg:left-[346px] lg:right-4 lg:top-[54px] lg:z-[14] lg:overflow-y-auto">
          {children}
        </div>
      )}

      {/* ---- sidebar ---- */}
      <aside className="order-3 flex flex-col lg:fixed lg:bottom-0 lg:left-0 lg:top-0 lg:z-10 lg:w-[330px] lg:overflow-y-auto lg:overflow-x-hidden lg:border-r lg:border-line lg:bg-abyss/40 lg:px-7 lg:pb-[150px] lg:pt-6 lg:backdrop-blur-2xl lg:backdrop-saturate-150">
        <div className="mb-6 hidden flex-col gap-0.5 lg:flex">
          <Link href="/" className="text-[24px] font-semibold tracking-[-0.02em] text-bright">
            Scala
          </Link>
          <span className="text-[12px] text-ink/45">Project hub</span>
        </div>

        <section className="mb-7">
          <SectionRule label="Overview" sub="portfolio" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:flex lg:flex-col lg:gap-[18px]">
            <SideStat
              label="Active projects"
              value={String(data.vitals.activeProjects)}
              note="14-day log"
              spark={data.vitals.activity}
            />
            <SideStat label="Average progress" value={`${data.vitals.avgProgress}%`} note="features built" />
            <SideStat
              label="Needs attention"
              value={String(data.vitals.hotCount)}
              note="idle ≥ 7d"
              noteColor={data.vitals.hotCount > 0 ? "var(--color-warn)" : undefined}
            />
            <SideStat
              label="Longest idle"
              value={`${data.vitals.longestIdleDays}d`}
              note={data.vitals.longestIdleName ?? undefined}
            />
          </div>
        </section>

        {data.tutor && (
          <section className="mb-7">
            <SectionRule label="Training" sub={`cpptutor · ${relTime(data.tutor.updatedAt)}`} />
            <TrainingUplink tutor={data.tutor} />
          </section>
        )}

        {directives.length > 0 && (
          <section className="mb-7">
            <SectionRule label="Next actions" sub={`top ${directives.length}`} />
            <div className="flex flex-col gap-2.5">
              {directives.map((p) => {
                const done = !!(p.nextActionFeatureId && doneTicks[p.nextActionFeatureId]);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleDirective(p)}
                    className="flex items-start gap-2.5 text-left transition-opacity hover:opacity-80"
                    title={`${p.name} — mark "${p.nextAction}" built`}
                  >
                    <span
                      className={`mt-0.5 flex h-[16px] w-[16px] flex-none items-center justify-center rounded-full border text-[9px] leading-none transition-colors ${
                        done
                          ? "border-accent bg-accent text-white"
                          : "border-white/25 text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span
                      className="text-[13px] leading-[1.5]"
                      style={{
                        color: done ? "rgb(235 235 245 / 0.35)" : "rgb(245 245 247 / 0.85)",
                        textDecoration: done ? "line-through" : "none",
                      }}
                    >
                      {p.nextAction}
                      <span className="text-ink/40"> · {p.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {upcoming4.length > 0 && (
          <section className="mb-7">
            <SectionRule label="Reminders" sub={`next ${upcoming4.length}`} />
            <div className="flex flex-col gap-2">
              {upcoming4.map((u, i) => (
                <Link
                  key={i}
                  href={u.href}
                  className="flex items-baseline gap-2 transition-opacity hover:opacity-80"
                >
                  <span className="w-[84px] flex-none text-[11px] text-ink/50 tabular-nums">
                    {u.when}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px]"
                    style={{
                      color: u.source === "event" ? "var(--color-cyan)" : "var(--color-ink)",
                    }}
                  >
                    {u.title}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mb-5">
          <SectionRule
            label="Projects"
            sub={`${data.projects.length} · stalest first`}
          />
          <div className="flex flex-col gap-0.5">
            {data.projects.map((p) => {
              const selc = mode === "core" && sel?.slug === p.slug;
              const meta = PROJECT_STATUS_META[p.status];
              return (
                <button
                  key={p.id}
                  onClick={() => select(p)}
                  className={`flex min-h-[34px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    selc ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 flex-none rounded-full ${p.tier === "dying" && p.status !== "done" ? "pulse-dot" : ""}`}
                    style={{ background: meta.color }}
                    aria-hidden
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      selc ? "font-medium text-bright" : "text-ink/75"
                    }`}
                  >
                    {p.name}
                  </span>
                  <span className="flex-none text-[11px] text-ink/45 tabular-nums">{p.pct}%</span>
                  <span
                    className="min-w-[30px] flex-none text-right text-[11px] tabular-nums"
                    style={{
                      color:
                        p.status === "done"
                          ? "rgb(235 235 245 / 0.3)"
                          : STALENESS_META[p.tier].color,
                    }}
                  >
                    {p.idleDays === 0 ? "now" : `${p.idleDays}d`}
                  </span>
                </button>
              );
            })}
          </div>
          {doneCount > 0 && (
            <span className="mt-1.5 block text-[11px] text-ink/35">
              {doneCount} done · see Archive
            </span>
          )}
        </section>

        <button onClick={() => setNewOpen(true)} className="btn-quiet mb-7 min-h-[40px]">
          + New project
        </button>

        <LauncherSection apps={data.launcher} />

        <nav className="mt-0 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4">
          {(
            [
              ["/cpptutor", "Tutor"],
              ["/reminders", "Reminders"],
              ["/review", "Week"],
              ["/vault", "Vault"],
              ["/stale", "Stale"],
              ["/archive", "Archive"],
              ["/search?q=", "Search"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="text-[12px] font-medium text-ink/50 transition-colors hover:text-bright"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* ---- voice dock ---- */}
      <div className="order-4 safe-bottom lg:fixed lg:bottom-[14px] lg:left-4 lg:z-[15]">
        <VoiceDock
          briefs={data.briefs}
          voice={voice}
          setVoice={setVoice}
          bus={bus}
          interpret={interpret}
        />
      </div>

      {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function Stat({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <span className="text-[12px] text-ink/50">
      {k}{" "}
      <span className="font-semibold" style={{ color: c ?? "#f5f5f7" }}>
        {v}
      </span>
    </span>
  );
}
