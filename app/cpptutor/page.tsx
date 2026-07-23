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

export const metadata = { title: "cpptutor — skill tree · rectile" };

/** Display rows of the unlock graph, top (always open) to bottom (endgame). */
const TIERS: { label: string; sub: string; ids: string[] }[] = [
  { label: "TIER I — FOUNDATIONS", sub: "ALWAYS OPEN", ids: ["cpp", "system"] },
  {
    label: "TIER II — BRANCHES",
    sub: "UNLOCKED BY THE MAIN QUEST",
    ids: ["problems", "netsec", "c"],
  },
  { label: "TIER III — SIDE QUEST", sub: "VIA THE C TRACK", ids: ["rust"] },
  {
    label: "TIER IV — ENDGAME",
    sub: "C++ CORE + FULL C TRACK",
    ids: ["ai", "gpu"],
  },
];

function moduleState(m: SkillModule) {
  if (m.total > 0 && m.done >= m.total) return "complete" as const;
  if (!m.unlocked) return "locked" as const;
  if (m.done > 0) return "active" as const;
  return "open" as const;
}

const MODULE_STYLE: Record<ReturnType<typeof moduleState>, string> = {
  complete: "border-accent/60 bg-accent/10 text-bright",
  active: "border-line-strong text-bright",
  open: "border-line text-ink/60",
  locked: "border-line text-ink/25",
};

const MODULE_MARK: Record<ReturnType<typeof moduleState>, string> = {
  complete: "✓",
  active: "◐",
  open: "○",
  locked: "⊘",
};

function ModuleChip({ m }: { m: SkillModule }) {
  const state = moduleState(m);
  const hint =
    state === "locked" && m.requires.length
      ? ` · locked, needs ${m.requires.join(", ")}`
      : "";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-1 text-[9.5px] tracking-[0.1em] ${MODULE_STYLE[state]}`}
      title={`${m.id} — ${m.title} (${m.done}/${m.total})${hint}`}
    >
      <span
        className={state === "complete" ? "text-accent" : ""}
        aria-hidden
      >
        {MODULE_MARK[state]}
      </span>
      <span className="font-semibold">{m.id.toUpperCase()}</span>
      {state === "active" && (
        <span className="text-ink/50">
          {m.done}/{m.total}
        </span>
      )}
      {m.mastered && (
        <span className="text-warn" title="boss fight mastered">
          ★
        </span>
      )}
    </span>
  );
}

function TrackPanel({ t }: { t: SkillTrack }) {
  const complete = t.total > 0 && t.done >= t.total;
  const badge = complete
    ? { label: "COMPLETE", color: "var(--color-ok)" }
    : t.unlocked
      ? { label: "OPEN", color: "var(--color-accent)" }
      : { label: "LOCKED", color: "rgb(217 210 236 / 0.35)" };
  return (
    <div
      className={`hud-panel flex min-w-0 flex-1 basis-72 flex-col gap-3 p-4 ${
        t.unlocked ? "" : "opacity-60 saturate-50"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-[15px]" aria-hidden>
          {t.icon}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-[13px] font-bold tracking-[0.06em] text-bright">
          {t.title}
        </span>
        <span
          className="flex-none border border-line px-1.5 py-0.5 text-[8px] font-bold tracking-[0.22em]"
          style={{ color: badge.color }}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-[10.5px] leading-relaxed text-ink/50">{t.tagline}</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="hud-sublabel">LESSONS</span>
          <span className="text-[10px] font-semibold tracking-[0.08em] text-ink/70">
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
        <p className="text-[9.5px] tracking-[0.12em] text-ink/40">
          ⛓ UNLOCK: {t.unlock_hint.toUpperCase()}
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
        ? "rgb(179 156 245 / 0.3)"
        : n <= 3
          ? "rgb(179 156 245 / 0.6)"
          : "rgb(179 156 245 / 0.95)";
  const active = cells.filter((c) => c.n > 0).length;
  const completions = cells.reduce((s, c) => s + c.n, 0);

  return (
    <div className="hud-panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="hud-sublabel">
          LAST {WEEKS} WEEKS · {active} ACTIVE DAYS · {completions} COMPLETIONS
        </span>
        <span className="flex items-center gap-1 text-[8px] tracking-[0.2em] text-ink/40">
          LESS
          {[0, 1, 2, 4].map((n) => (
            <span
              key={n}
              className="inline-block h-2 w-2"
              style={{ background: fill(n) }}
              aria-hidden
            />
          ))}
          MORE
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
    <div className="hud-panel flex min-w-0 flex-1 basis-40 flex-col gap-1 p-4">
      <span className="hud-sublabel">{label}</span>
      <span className="font-display text-[22px] font-bold leading-none text-bright">
        {value}
      </span>
      {sub && (
        <span className="text-[9px] tracking-[0.14em] text-ink/45">{sub}</span>
      )}
    </div>
  );
}

export default async function CpptutorPage() {
  const row = await getKv<CpptutorProgress>("cpptutor_progress");

  if (!row) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="TRAINING UPLINK" sub="CPPTUTOR.SYNC" />
        <div className="hud-panel p-6 text-[11.5px] leading-relaxed text-ink/60">
          NO UPLINK DATA YET — finish a lesson in a cpptutor session on the
          laptop and rectile_sync.py will push progress here.
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
      <SectionHeader label="TRAINING UPLINK" sub="CPPTUTOR.SYNC" />

      {/* operator identity */}
      <div className="hud-panel flex flex-col gap-4 p-5">
        <div className="grid grid-cols-1 items-center gap-x-8 gap-y-4 lg:grid-cols-[auto_1fr_1fr]">
          <div className="flex items-baseline gap-3">
            <span
              className="font-display text-[52px] font-bold leading-none text-bright"
              style={{ textShadow: "0 0 30px rgb(150 110 255 / 0.45)" }}
            >
              L{data.level}
              {data.prestige > 0 && (
                <span className="ml-1 text-[18px] text-accent">
                  ✦{data.prestige}
                </span>
              )}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[12px] font-bold tracking-[0.24em] text-accent">
                {data.title.toUpperCase()}
              </span>
              <span className="text-[10px] tracking-[0.14em] text-ink/50">
                {data.xp} XP SPENDABLE · {data.xp_lifetime} LIFETIME
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="hud-sublabel">
                LEVEL {data.level} → {data.level + 1}
              </span>
              <span className="text-[10px] font-semibold tracking-[0.08em] text-ink/70">
                {levelInto} / {levelSpan} XP
              </span>
            </div>
            <ProgressBar built={levelInto} total={levelSpan} height={5} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="hud-sublabel">CURRICULUM</span>
              <span className="text-[10px] font-semibold tracking-[0.08em] text-ink/70">
                {data.done} / {data.total} · {lessonPct}%
              </span>
            </div>
            <ProgressBar built={data.done} total={data.total} height={5} />
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
          <p className="min-w-0 flex-1 basis-64 text-[11.5px] text-ink">
            <span className="mr-2 text-[9px] font-bold tracking-[0.22em] text-accent">
              NEXT ▸
            </span>
            {data.next_lesson ? (
              <>
                {data.next_lesson}
                <span className="text-ink/45">
                  {" "}
                  · {data.next_module} · {data.next_track}
                </span>
              </>
            ) : (
              "ALL LESSONS COMPLETE"
            )}
          </p>
          <Link
            href="/p/cpptutor"
            className="text-[9px] font-bold tracking-[0.22em] text-ink/50 transition-colors hover:text-accent"
          >
            MISSION LOG ▸
          </Link>
          <span className="hud-sublabel">SYNCED {relTime(row.updatedAt)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Stat
          label="STREAK"
          value={`${data.streak}d`}
          sub={`BEST ${data.streak_best} · ${data.freezes ?? 0} FREEZE${(data.freezes ?? 0) === 1 ? "" : "S"} BANKED`}
        />
        <Stat
          label="PRESTIGE"
          value={data.prestige > 0 ? `✦${data.prestige}` : "—"}
          sub={data.prestige > 0 ? "VETERAN CYCLE" : "FIRST CYCLE"}
        />
        <Stat
          label="TRACKS OPEN"
          value={`${tree.filter((t) => t.unlocked).length || "—"}${tree.length ? ` / ${tree.length}` : ""}`}
          sub="OF THE SKILL TREE"
        />
        <Stat
          label="MODULES DONE"
          value={String(
            tree.reduce(
              (s, t) =>
                s +
                t.modules.filter((m) => m.total > 0 && m.done >= m.total).length,
              0,
            ),
          )}
          sub={`OF ${tree.reduce((s, t) => s + t.modules.length, 0)} · ★ ${tree.reduce(
            (s, t) => s + t.modules.filter((m) => m.mastered).length,
            0,
          )} MASTERED`}
        />
      </div>

      {data.activity && <Heatmap activity={data.activity} />}

      {tree.length ? (
        <>
          <SectionHeader label="SKILL TREE" sub="UNLOCK.GRAPH" />
          <div className="flex flex-col gap-5">
            {TIERS.map((tier) => {
              const tracks = tier.ids
                .map((id) => byId.get(id))
                .filter((t): t is SkillTrack => Boolean(t));
              if (!tracks.length) return null;
              return (
                <div key={tier.label} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold tracking-[0.26em] text-ink/45">
                      {tier.label}
                    </span>
                    <span className="text-[8px] tracking-[0.2em] text-ink/25">
                      {tier.sub}
                    </span>
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
        <div className="hud-panel p-5 text-[11px] leading-relaxed text-ink/50">
          FULL SKILL TREE ARRIVES ON NEXT SYNC — the tutor pushes the detailed
          unlock graph after the next study session.
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
