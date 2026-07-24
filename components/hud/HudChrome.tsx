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
import type { HudChromeData, HudProject } from "@/lib/hud-types";
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
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().slice(0, 8));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-[9.5px] font-semibold tracking-[0.14em] text-accent tabular-nums">
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
    <span className="whitespace-nowrap text-[9.5px] font-medium tracking-[0.26em] text-ink/65">
      LINK ·{" "}
      <span style={{ color: online ? undefined : "var(--color-warn)" }}>
        {online ? "ONLINE" : "OFFLINE"}
      </span>
    </span>
  );
}

function SectionRule({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="hud-label">{label}</span>
      {sub && <span className="hud-sublabel">{sub}</span>}
      <div className="hud-rule" />
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
        <span
          className="h-[5px] w-[5px] flex-none self-center rounded-full bg-accent"
          style={{ boxShadow: "0 0 6px var(--color-accent)" }}
          aria-hidden
        />
        <span className="flex-1 truncate text-[9px] font-medium tracking-[0.2em] text-ink/60">
          {label}
        </span>
        {note && (
          <span
            className="truncate text-[9px] font-semibold tracking-[0.08em]"
            style={{ color: noteColor ?? "rgb(217 210 236 / 0.4)" }}
          >
            {note}
          </span>
        )}
      </div>
      <span className="font-display text-[34px] font-bold leading-none tracking-[0.02em] text-bright">
        {value}
      </span>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

function GlowBar({ pct }: { pct: number }) {
  return (
    <div className="h-[3px] w-full bg-white/5">
      <div
        className="h-full transition-[width] duration-500"
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          background: "linear-gradient(90deg, rgb(150 110 255 / 0.7), var(--color-accent))",
          boxShadow: "0 0 8px rgb(150 110 255 / 0.6)",
        }}
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
        <span
          className="font-display text-[26px] font-bold leading-none text-bright"
          style={{ textShadow: "0 0 22px rgb(150 110 255 / 0.45)" }}
        >
          L{d.level}
          {d.prestige > 0 && <span className="text-[13px] text-accent">✦{d.prestige}</span>}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[10px] font-bold tracking-[0.22em] text-accent group-hover:text-bright">
            {d.title.toUpperCase()}
          </span>
          <span className="text-[8.5px] tracking-[0.14em] text-ink/50">
            {d.xp} XP{d.streak > 0 && ` · STREAK ${d.streak}`}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] tracking-[0.18em] text-ink/35">
            LEVEL {d.level} → {d.level + 1}
          </span>
          <span className="text-[9px] font-semibold text-ink/70">
            {into} / {span} XP
          </span>
        </div>
        <GlowBar pct={(into / span) * 100} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[8px] tracking-[0.18em] text-ink/35">LESSONS</span>
          <span className="text-[9px] font-semibold text-ink/70">
            {d.done} / {d.total}
          </span>
        </div>
        <GlowBar pct={d.total ? (d.done / d.total) * 100 : 0} />
      </div>
      <span className="truncate text-[9px] text-ink/50">
        <span className="text-accent">next ▸ </span>
        {d.next_lesson ? `${d.next_lesson} · ${d.next_module}` : "ALL LESSONS COMPLETE"}
      </span>
    </Link>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputCls =
    "min-h-[44px] w-full border border-line bg-panel/70 px-3 text-[12px] text-bright placeholder:text-ink/30 focus:border-line-strong focus:outline-none";
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
      className="fixed inset-0 z-[28] flex items-center justify-center bg-[rgb(4_2_10/0.6)] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="fade-in flex w-[min(440px,90%)] flex-col gap-2 border border-line-strong bg-[rgb(14_8_26/0.95)] p-4"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="hud-label">NEW PROJECT</span>
          <div className="hud-rule" />
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="flex h-8 w-8 items-center justify-center text-ink/40 hover:text-bright"
          >
            ×
          </button>
        </div>
        <input name="name" required maxLength={200} placeholder="NAME" className={inputCls} autoFocus />
        <textarea
          name="description"
          placeholder="description (optional)"
          rows={2}
          className={`${inputCls} resize-none py-2.5`}
        />
        <div className="flex gap-2">
          <input name="category" placeholder="category" className={`${inputCls} min-w-0 flex-1`} />
          <select
            name="priority"
            defaultValue="2"
            className="min-h-[44px] w-24 flex-none border border-line bg-panel/70 px-3 text-[12px] text-bright focus:border-line-strong focus:outline-none"
          >
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
          </select>
        </div>
        <input name="tags" placeholder="tags, comma, separated" className={inputCls} />
        <button
          type="submit"
          className="min-h-[44px] border border-line-strong bg-accent/10 text-[10px] font-bold tracking-[0.24em] text-accent transition-colors hover:bg-accent/20 hover:text-bright"
        >
          INITIALIZE ▸
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
      className="whitespace-nowrap text-[9.5px] font-medium tracking-[0.26em] transition-colors hover:text-bright"
      style={{ color: active ? "#efe9ff" : "rgb(217 210 236 / 0.65)" }}
    >
      {active && <span className="text-accent">● </span>}
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-8 lg:block">
      {/* ---- mobile brand ---- */}
      <div className="safe-top order-0 flex flex-col gap-0.5 pt-3 lg:hidden">
        <Link
          href="/"
          className="text-[22px] font-bold tracking-[0.18em] text-bright"
          style={{ textShadow: "0 0 18px rgb(150 110 255 / 0.5)" }}
        >
          R.E.C.T.I.L.E.
        </Link>
        <span className="text-[8px] font-medium tracking-[0.3em] text-ink/40">
          PROJECT OPERATIONS TERMINAL
        </span>
      </div>

      {/* ---- topline ---- */}
      <div className="safe-top order-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-2 lg:fixed lg:left-[330px] lg:right-4 lg:top-[18px] lg:z-10 lg:pt-0">
        {topLink("/", mode === "core", <>CORE · {data.vitals.hotCount} STALE</>)}
        {topLink("/calendar", mode === "cal", <>CAL · {data.upcoming.length} UPCOMING</>)}
        {topLink(
          "/mail",
          mode === "mail",
          <>MAIL · {data.mailUnread === null ? "—" : `${data.mailUnread} UNREAD`}</>,
        )}
        <LinkStatus />
        <span className="whitespace-nowrap text-[9.5px] font-medium tracking-[0.26em] text-ink/65">
          VOICE ·{" "}
          <span style={{ color: VOICE_COLOR[voice] }}>
            {voice === "idle" ? "STANDBY" : voice === "listening" ? "LISTENING…" : "RESPONDING"}
          </span>
        </span>
        <Clock />
        <span className="flex items-center gap-1">
          <button
            onClick={() => history.back()}
            aria-label="back"
            className="flex h-7 w-7 items-center justify-center border border-line text-[10px] text-ink/45 hover:border-line-strong hover:text-accent"
          >
            ◂
          </button>
          <button
            onClick={() => history.forward()}
            aria-label="forward"
            className="flex h-7 w-7 items-center justify-center border border-line text-[10px] text-ink/45 hover:border-line-strong hover:text-accent"
          >
            ▸
          </button>
          <button
            onClick={() => location.reload()}
            aria-label="reload"
            className="flex h-7 w-7 items-center justify-center border border-line text-[10px] text-ink/45 hover:border-line-strong hover:text-accent"
          >
            ⟳
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

          {/* corner deco frames */}
          <div
            className="pointer-events-none fixed hidden border border-line lg:block"
            style={{ left: "calc(330px + (100% - 330px)*0.28)", top: "16%", width: 130, height: 92 }}
            aria-hidden
          />
          <div
            className="pointer-events-none fixed hidden border lg:block"
            style={{
              left: "calc(330px + (100% - 330px)*0.9)",
              top: "62%",
              width: 130,
              height: 92,
              borderColor: "rgb(150 110 255 / 0.14)",
            }}
            aria-hidden
          />

          {/* pinned tags (desktop only) */}
          {hydrated && pins.length > 0 && (
            <button
              onClick={() => {
                bus.current.tags = {};
                setPinned([]);
              }}
              className="fixed top-[52px] z-[12] hidden -translate-x-1/2 whitespace-nowrap border border-line bg-[rgb(18_10_34/0.7)] px-4 py-1.5 text-[9px] font-medium tracking-[0.26em] text-ink/70 transition-colors hover:border-line-strong hover:text-bright lg:block"
              style={{ left: "calc(330px + (100% - 330px)*0.5)" }}
            >
              CLEAR ALL ×{pins.length}
            </button>
          )}
          {hydrated &&
            pins.map(({ p, slot }) => (
              <div
                key={p.slug}
                ref={(el) => {
                  bus.current.tags[p.slug] = { el, d: slot.d };
                }}
                className="fixed z-[11] hidden min-w-[190px] max-w-[230px] -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 border border-line bg-[rgb(14_8_26/0.82)] px-3 py-2 backdrop-blur-[3px] will-change-transform lg:flex"
                style={{ left: `calc(330px + (100% - 330px)*${slot.fx})`, top: slot.y }}
              >
                <span className="flex-none text-[11px] text-accent" aria-hidden>
                  ◈
                </span>
                <button
                  onClick={() => setSelSlug(p.slug)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                >
                  <span className="truncate text-[10.5px] font-bold tracking-[0.18em] text-bright">
                    {p.name.toUpperCase()}
                  </span>
                  <span className="truncate text-[8.5px] text-ink/45">
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
                  className="flex-none p-0.5 text-[11px] text-ink/40 hover:text-bright"
                >
                  ×
                </button>
              </div>
            ))}

          {/* primary directive */}
          {sel && (
            <div className="z-[15] mx-auto flex w-full max-w-[660px] flex-col items-center gap-2 lg:fixed lg:bottom-[14px] lg:left-[calc(330px+(100%-330px)*0.5)] lg:w-[min(660px,calc((100%-330px)*0.92))] lg:-translate-x-1/2">
              <Link
                href={`/p/${sel.slug}`}
                className="max-w-full truncate whitespace-nowrap text-[9px] font-medium tracking-[0.34em] text-[rgb(179_156_245/0.85)] transition-colors hover:text-bright"
              >
                PRIMARY DIRECTIVE · {sel.name.toUpperCase()} ↗
              </Link>
              <div className="flex items-baseline gap-3">
                <span
                  className="font-display text-[clamp(44px,9vh,72px)] font-bold leading-none tracking-[0.01em] text-[#f4efff]"
                  style={{ textShadow: "0 0 30px rgb(150 110 255 / 0.45)" }}
                >
                  {sel.pct}%
                </span>
                <span className="text-[12px] font-medium tracking-[0.3em] text-ink/55">
                  COMPLETE
                </span>
              </div>
              <div className="w-[min(420px,80%)]">
                <GlowBar pct={sel.pct} />
              </div>
              <div
                className="h-px w-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgb(179 156 245 / 0.6), transparent)",
                }}
              />
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 whitespace-nowrap">
                <Stat k="BUILT" v={`${sel.built} / ${sel.total}`} />
                <Stat
                  k="TOUCHED"
                  v={sel.idleDays === 0 ? "TODAY" : `${sel.idleDays}D AGO`}
                  c={sel.tier === "fresh" ? "#efe9ff" : STALENESS_META[sel.tier].color}
                />
                <Stat k="AGE" v={`${sel.ageDays}D`} />
                <Stat
                  k="STATUS"
                  v={PROJECT_STATUS_META[sel.status].label}
                  c={PROJECT_STATUS_META[sel.status].color}
                />
                <Stat k="PRIORITY" v={`P${sel.priority}`} />
              </div>
              <div className="max-w-full truncate text-[10px] text-ink/50">
                <span className="text-accent">next ▸ </span>
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
      <aside className="order-3 flex flex-col lg:fixed lg:bottom-0 lg:left-0 lg:top-0 lg:z-10 lg:w-[330px] lg:overflow-y-auto lg:overflow-x-hidden lg:px-7 lg:pb-[150px] lg:pt-6">
        <div className="mb-6 hidden flex-col gap-1.5 lg:flex">
          <Link
            href="/"
            className="text-[26px] font-bold tracking-[0.18em] text-bright"
            style={{ textShadow: "0 0 18px rgb(150 110 255 / 0.5)" }}
          >
            R.E.C.T.I.L.E.
          </Link>
          <span className="text-[8.5px] font-medium tracking-[0.3em] text-ink/40">
            PROJECT OPERATIONS TERMINAL
          </span>
        </div>

        <section className="mb-7">
          <SectionRule label="SYSTEM VITALS" sub="PORTFOLIO.LINK" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:flex lg:flex-col lg:gap-[18px]">
            <SideStat
              label="ACTIVE PROJECTS"
              value={String(data.vitals.activeProjects)}
              note="LOG · 14D"
              spark={data.vitals.activity}
            />
            <SideStat label="AVG PROGRESS" value={`${data.vitals.avgProgress}%`} note="FEATURES BUILT" />
            <SideStat
              label="NEEDS ATTENTION"
              value={String(data.vitals.hotCount)}
              note="IDLE ≥ 7D"
              noteColor={data.vitals.hotCount > 0 ? "var(--color-warn)" : undefined}
            />
            <SideStat
              label="LONGEST IDLE"
              value={`${data.vitals.longestIdleDays}D`}
              note={data.vitals.longestIdleName?.toUpperCase()}
            />
          </div>
        </section>

        {data.tutor && (
          <section className="mb-7">
            <SectionRule label="TRAINING UPLINK" sub={`CPPTUTOR · ${relTime(data.tutor.updatedAt)}`} />
            <TrainingUplink tutor={data.tutor} />
          </section>
        )}

        {directives.length > 0 && (
          <section className="mb-7">
            <SectionRule label="DIRECTIVES" sub={`TOP.${directives.length}`} />
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
                    <span className="mt-px flex-none text-[11px] text-accent">
                      {done ? "■" : "□"}
                    </span>
                    <span
                      className="text-[11px] leading-[1.55]"
                      style={{
                        color: done ? "rgb(217 210 236 / 0.35)" : "rgb(233 228 247 / 0.85)",
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
            <SectionRule label="REMINDERS" sub={`NEXT.${upcoming4.length}`} />
            <div className="flex flex-col gap-2">
              {upcoming4.map((u, i) => (
                <Link
                  key={i}
                  href={u.href}
                  className="flex items-baseline gap-2 transition-opacity hover:opacity-80"
                >
                  <span className="w-[84px] flex-none text-[9px] text-ink/50 tabular-nums">
                    {u.when}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[10.5px]"
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
            label="PROJECTS"
            sub={`ROSTER.${String(data.projects.length).padStart(2, "0")} · STALEST FIRST`}
          />
          <div className="flex flex-col">
            {data.projects.map((p) => {
              const selc = mode === "core" && sel?.slug === p.slug;
              const meta = PROJECT_STATUS_META[p.status];
              return (
                <button
                  key={p.id}
                  onClick={() => select(p)}
                  className="flex min-h-[34px] items-center gap-2.5 px-1 py-1.5 text-left transition-colors hover:bg-accent/10"
                  style={{ background: selc ? "rgb(150 110 255 / 0.1)" : undefined }}
                >
                  <span
                    className={`h-1 w-1 flex-none rounded-full ${p.tier === "dying" && p.status !== "done" ? "pulse-dot" : ""}`}
                    style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}` }}
                    aria-hidden
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[11px]"
                    style={{ color: selc ? "#efe9ff" : "rgb(217 210 236 / 0.7)" }}
                  >
                    {p.name}
                  </span>
                  <span className="flex-none text-[9px] text-ink/45">{p.pct}%</span>
                  <span
                    className="min-w-[26px] flex-none text-right text-[9px]"
                    style={{
                      color:
                        p.status === "done"
                          ? "rgb(217 210 236 / 0.3)"
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
            <span className="mt-1 block text-[8px] tracking-[0.22em] text-ink/30">
              {doneCount} DONE IN ROSTER · ARCHIVE ON /ARCHIVE
            </span>
          )}
        </section>

        <button
          onClick={() => setNewOpen(true)}
          className="flex min-h-[44px] items-center justify-center gap-2 border border-line bg-panel/70 px-3 text-[9.5px] font-bold tracking-[0.24em] text-accent transition-colors hover:border-line-strong hover:text-bright"
        >
          + INITIALIZE PROJECT
        </button>

        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4">
          {(
            [
              ["/cpptutor", "TUTOR"],
              ["/reminders", "REMS"],
              ["/review", "WEEK"],
              ["/stale", "STALE"],
              ["/archive", "ARCHIVE"],
              ["/search?q=", "SEARCH"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="text-[9px] font-bold tracking-[0.24em] text-ink/45 transition-colors hover:text-accent"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* ---- voice dock ---- */}
      <div className="order-4 safe-bottom lg:fixed lg:bottom-[14px] lg:left-4 lg:z-[15]">
        <VoiceDock briefs={data.briefs} voice={voice} setVoice={setVoice} bus={bus} />
      </div>

      {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function Stat({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <span className="text-[9.5px] font-medium tracking-[0.18em] text-ink/45">
      {k}{" "}
      <span className="font-bold" style={{ color: c ?? "#efe9ff" }}>
        {v}
      </span>
    </span>
  );
}
