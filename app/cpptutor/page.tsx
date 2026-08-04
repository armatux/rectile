import Link from "next/link";
import { ProgressBar, SectionHeader } from "@/components/hud";
import type {
  CpptutorProgress,
  SkillModule,
  SkillTrack,
} from "@/lib/cpptutor";
import { getKv } from "@/lib/repo";
import { relTime } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "cpptutor — skill tree" };

/** Display rows of the unlock graph, top (always open) to bottom (endgame). */
const TIERS: { label: string; sub: string; ids: string[] }[] = [
  { label: "Tier I — Foundations", sub: "Always open", ids: ["cpp", "system"] },
  {
    label: "Tier II — Branches",
    sub: "Unlocked by the main quest",
    ids: ["problems", "netsec", "c"],
  },
  { label: "Tier III — Side quest", sub: "Via the C track", ids: ["rust"] },
  {
    label: "Tier IV — Endgame",
    sub: "C++ core + full C track",
    ids: ["ai", "gpu"],
  },
];

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" className={className} aria-hidden>
      <path
        d="M4 5V3.8a2 2 0 1 1 4 0V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect x="2.6" y="5" width="6.8" height="5.2" rx="1.6" fill="currentColor" />
    </svg>
  );
}

function moduleState(m: SkillModule) {
  if (m.total > 0 && m.done >= m.total) return "complete" as const;
  if (!m.unlocked) return "locked" as const;
  if (m.done > 0) return "active" as const;
  return "open" as const;
}

const MODULE_STYLE: Record<ReturnType<typeof moduleState>, string> = {
  complete: "bg-ok/10 text-ok hover:bg-ok/20",
  active: "bg-accent/10 text-accent hover:bg-accent/20",
  open: "bg-white/5 text-ink/70 hover:bg-white/10 hover:text-bright",
  locked: "bg-white/[0.03] text-ink/30",
};

function ModuleChip({ m }: { m: SkillModule }) {
  const state = moduleState(m);
  const hint =
    state === "locked" && m.requires.length
      ? ` · locked, needs ${m.requires.join(", ")}`
      : "";
  const inner = (
    <>
      {state === "complete" && <span aria-hidden>✓</span>}
      {state === "locked" && <LockIcon className="flex-none opacity-70" />}
      <span className="font-semibold">{m.id}</span>
      {state === "active" && (
        <span className="tabular-nums opacity-70">
          {m.done}/{m.total}
        </span>
      )}
      {m.mastered && (
        <span className="text-warn" title="boss fight mastered">
          ★
        </span>
      )}
    </>
  );
  const cls = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${MODULE_STYLE[state]}`;
  const title = `${m.id} — ${m.title} (${m.done}/${m.total})${hint}`;
  if (state === "locked") {
    return (
      <span className={cls} title={title}>
        {inner}
      </span>
    );
  }
  return (
    <Link
      href={`/cpptutor/module/${m.id}`}
      className={`${cls} transition-colors`}
      title={`${title} — open the lesson console`}
    >
      {inner}
    </Link>
  );
}

function TrackPanel({ t }: { t: SkillTrack }) {
  const complete = t.total > 0 && t.done >= t.total;
  const badge = complete
    ? { label: "Complete", color: "var(--color-ok)" }
    : t.unlocked
      ? { label: "Open", color: "var(--color-accent)" }
      : { label: "Locked", color: "rgb(235 235 245 / 0.35)" };
  return (
    <div
      className={`glass flex min-w-0 flex-1 basis-72 flex-col gap-3 p-4 ${
        t.unlocked ? "" : "opacity-60 saturate-50"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-[15px]" aria-hidden>
          {t.icon}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-bright">
          {t.title}
        </span>
        <span
          className="flex-none rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium"
          style={{ color: badge.color }}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-ink/55">{t.tagline}</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="hud-sublabel">Lessons</span>
          <span className="text-[12px] font-medium tabular-nums text-ink/70">
            {t.done} / {t.total}
          </span>
        </div>
        <ProgressBar built={t.done} total={t.total} height={4} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {t.modules.map((m) => (
          <ModuleChip key={m.id} m={m} />
        ))}
      </div>
      {!t.unlocked && t.unlock_hint && (
        <p className="flex items-center gap-1.5 text-[12px] text-ink/45">
          <LockIcon className="flex-none opacity-60" />
          Unlocks: {t.unlock_hint}
        </p>
      )}
    </div>
  );
}

/** GitHub-style activity heatmap, Monday-aligned, ending this week. */
function Heatmap({ activity }: { activity: Record<string, number> }) {
  const WEEKS = 26;
  const CELL = 11;
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(monday.getDate() - (WEEKS - 1) * 7);

  const cells: { x: number; y: number; day: string; n: number }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      if (date > today) continue;
      const day = date.toISOString().slice(0, 10);
      cells.push({ x: w * CELL, y: d * CELL, day, n: activity[day] ?? 0 });
    }
  }
  const fill = (n: number) =>
    n === 0
      ? "rgb(255 255 255 / 0.05)"
      : n === 1
        ? "rgb(10 132 255 / 0.35)"
        : n <= 3
          ? "rgb(10 132 255 / 0.6)"
          : "rgb(10 132 255 / 0.95)";
  const active = cells.filter((c) => c.n > 0).length;
  const completions = cells.reduce((s, c) => s + c.n, 0);

  return (
    <div className="glass flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="hud-label">Activity</span>
          <span className="hud-sublabel">
            Last {WEEKS} weeks · {active} active days · {completions}{" "}
            completions
          </span>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-ink/40">
          Less
          {[0, 1, 2, 4].map((n) => (
            <span
              key={n}
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ background: fill(n) }}
              aria-hidden
            />
          ))}
          More
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          width={WEEKS * CELL}
          height={7 * CELL}
          role="img"
          aria-label="study activity heatmap"
        >
          {cells.map((c) => (
            <rect
              key={c.day}
              x={c.x}
              y={c.y}
              width={CELL - 2}
              height={CELL - 2}
              rx={2}
              fill={fill(c.n)}
            >
              <title>{`${c.day} — ${c.n} completion${c.n === 1 ? "" : "s"}`}</title>
            </rect>
          ))}
        </svg>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass flex min-w-0 flex-1 basis-40 flex-col gap-1 p-4">
      <span className="hud-sublabel">{label}</span>
      <span className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-bright tabular-nums">
        {value}
      </span>
      {sub && <span className="text-[11px] text-ink/45">{sub}</span>}
    </div>
  );
}

export default async function CpptutorPage() {
  const row = await getKv<CpptutorProgress>("cpptutor_progress");

  if (!row) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="Training" sub="cpptutor" />
        <div className="glass p-6 text-[13px] leading-relaxed text-ink/60">
          No progress synced yet — finish a lesson in a cpptutor session on the
          laptop and it will appear here.
        </div>
      </div>
    );
  }

  const data = row.value;
  const tree = data.skill_tree ?? [];
  const byId = new Map(tree.map((t) => [t.id, t]));
  const placed = new Set(TIERS.flatMap((tier) => tier.ids));
  const leftovers = tree.filter((t) => !placed.has(t.id));
  const levelSpan = Math.max(1, data.xp_level_next - data.xp_level_floor);
  const levelInto = Math.max(0, data.xp_lifetime - data.xp_level_floor);
  const lessonPct = data.total ? ((data.done / data.total) * 100).toFixed(1) : "0";

  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader label="Training" sub="cpptutor" />

      {/* operator identity */}
      <div className="glass flex flex-col gap-4 p-5">
        <div className="grid grid-cols-1 items-center gap-x-8 gap-y-4 lg:grid-cols-[auto_1fr_1fr]">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[52px] font-semibold leading-none tracking-[-0.03em] text-bright tabular-nums">
              L{data.level}
              {data.prestige > 0 && (
                <span className="ml-1 text-[18px] text-accent">
                  ✦{data.prestige}
                </span>
              )}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold text-bright">
                {data.title}
              </span>
              <span className="text-[12px] tabular-nums text-ink/50">
                {data.xp} XP spendable · {data.xp_lifetime} lifetime
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="hud-sublabel">
                Level {data.level} → {data.level + 1}
              </span>
              <span className="text-[12px] font-medium tabular-nums text-ink/70">
                {levelInto} / {levelSpan} XP
              </span>
            </div>
            <ProgressBar built={levelInto} total={levelSpan} height={5} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="hud-sublabel">Curriculum</span>
              <span className="text-[12px] font-medium tabular-nums text-ink/70">
                {data.done} / {data.total} · {lessonPct}%
              </span>
            </div>
            <ProgressBar built={data.done} total={data.total} height={5} />
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
          <p className="min-w-0 flex-1 basis-64 text-[13px] text-ink">
            <span className="mr-2 font-semibold text-ink/50">Next</span>
            {data.next_lesson ? (
              data.next_id ? (
                <Link
                  href={`/cpptutor/lesson/${data.next_id}`}
                  className="transition-colors hover:text-accent"
                >
                  {data.next_lesson}
                  <span className="text-ink/45">
                    {" "}
                    · {data.next_module} · {data.next_track}
                  </span>
                  <span className="ml-2 text-[12px] font-medium text-accent">
                    Study ›
                  </span>
                </Link>
              ) : (
                <>
                  {data.next_lesson}
                  <span className="text-ink/45">
                    {" "}
                    · {data.next_module} · {data.next_track}
                  </span>
                </>
              )
            ) : (
              "All lessons complete"
            )}
          </p>
          <Link
            href="/p/cpptutor"
            className="text-[12px] font-medium text-accent transition-colors hover:text-[#409cff]"
          >
            Project log ›
          </Link>
          <span className="hud-sublabel">Synced {relTime(row.updatedAt)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Stat
          label="Streak"
          value={`${data.streak}d`}
          sub={`Best ${data.streak_best} · ${data.freezes ?? 0} freeze${(data.freezes ?? 0) === 1 ? "" : "s"} banked`}
        />
        <Stat
          label="Prestige"
          value={data.prestige > 0 ? `✦${data.prestige}` : "—"}
          sub={data.prestige > 0 ? "Veteran cycle" : "First cycle"}
        />
        <Stat
          label="Tracks open"
          value={`${tree.filter((t) => t.unlocked).length || "—"}${tree.length ? ` / ${tree.length}` : ""}`}
          sub="of the skill tree"
        />
        <Stat
          label="Modules done"
          value={String(
            tree.reduce(
              (s, t) =>
                s +
                t.modules.filter((m) => m.total > 0 && m.done >= m.total).length,
              0,
            ),
          )}
          sub={`of ${tree.reduce((s, t) => s + t.modules.length, 0)} · ${tree.reduce(
            (s, t) => s + t.modules.filter((m) => m.mastered).length,
            0,
          )} mastered`}
        />
      </div>

      {data.activity && <Heatmap activity={data.activity} />}

      {tree.length ? (
        <>
          <SectionHeader
            label="Skill tree"
            sub={`${tree.length} tracks`}
          />
          <div className="flex flex-col gap-5">
            {TIERS.map((tier) => {
              const tracks = tier.ids
                .map((id) => byId.get(id))
                .filter((t): t is SkillTrack => Boolean(t));
              if (!tracks.length) return null;
              return (
                <div key={tier.label} className="flex flex-col gap-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="hud-label">{tier.label}</span>
                    <span className="hud-sublabel">{tier.sub}</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {tracks.map((t) => (
                      <TrackPanel key={t.id} t={t} />
                    ))}
                  </div>
                </div>
              );
            })}
            {leftovers.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {leftovers.map((t) => (
                  <TrackPanel key={t.id} t={t} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="glass p-5 text-[13px] leading-relaxed text-ink/55">
          The full skill tree arrives on the next sync — the tutor pushes the
          detailed unlock graph after the next study session.
          {(data.tracks ?? []).length > 0 && (
            <span className="mt-2 block">
              {(data.tracks ?? [])
                .map((t) => `${t.title}: ${t.done}/${t.total}`)
                .join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
