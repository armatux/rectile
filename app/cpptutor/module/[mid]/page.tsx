import Link from "next/link";
import { ProgressBar, SectionHeader } from "@/components/hud";
import type { BridgeTree } from "@/lib/cpptutor";
import { bridge } from "@/lib/tutorBridge";

export const dynamic = "force-dynamic";

function LinkDown() {
  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader label="Lessons" sub="Laptop offline" />
      <div className="glass p-6 text-[13px] leading-relaxed text-ink/60">
        Laptop offline — the lesson console talks to the tutor engine on the
        laptop. Wake the laptop (and the cpptutor-bridge service) and reload.
      </div>
      <Link
        href="/cpptutor"
        className="text-[13px] font-medium text-accent transition-colors hover:text-[#409cff]"
      >
        ‹ Skill tree
      </Link>
    </div>
  );
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ mid: string }>;
}) {
  const { mid } = await params;
  let tree: BridgeTree;
  try {
    const r = await bridge<BridgeTree>("GET", "/tree");
    if (r.status !== 200) return <LinkDown />;
    tree = r.data;
  } catch {
    return <LinkDown />;
  }

  const track = tree.tracks.find((t) => t.modules.some((m) => m.id === mid));
  const mod = track?.modules.find((m) => m.id === mid);
  if (!track || !mod) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="Lessons" sub="Not found" />
        <div className="glass p-6 text-[13px] text-ink/60">
          No module “{mid}” in the curriculum.
        </div>
      </div>
    );
  }

  const locked = !track.unlocked || !mod.unlocked;

  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader
        label={`${track.icon} ${mod.id}`}
        sub={track.title}
      />

      <div className="glass flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-bright">
            {mod.title}
            {mod.mastered && (
              <span className="ml-2 text-warn" title="boss fight mastered">★</span>
            )}
          </h1>
          <span className="text-[12px] font-medium tabular-nums text-ink/70">
            {mod.done} / {mod.total} lessons
          </span>
        </div>
        {mod.description && (
          <p className="text-[13px] leading-relaxed text-ink/60">{mod.description}</p>
        )}
        <ProgressBar built={mod.done} total={mod.total} height={4} />
        {tree.terminal_session && (
          <p className="text-[12px] text-warn">
            A terminal session is running on the laptop — progress here is
            read-only until it ends.
          </p>
        )}
      </div>

      {locked ? (
        <div className="glass flex flex-col gap-1 p-6 text-[13px] leading-relaxed text-ink/55">
          <span className="font-medium text-ink/80">Module locked</span>
          {mod.requires.length > 0 && (
            <span>Needs {mod.requires.join(", ")}</span>
          )}
          {!track.unlocked && track.unlock_hint && (
            <span>Track unlock: {track.unlock_hint}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {mod.lessons.map((l, i) => {
            const stages = [
              { label: "Read", on: l.read, always: true },
              { label: "Quiz", on: l.quiz_done, always: l.has_quiz },
              { label: "Forge", on: l.exercise_done, always: l.has_exercise },
            ].filter((s) => s.always);
            return (
              <Link
                key={l.id}
                href={`/cpptutor/lesson/${l.id}`}
                className="glass group flex items-center gap-4 px-4 py-3 transition-colors hover:border-line-strong"
              >
                <span className="w-7 flex-none text-right text-[13px] font-semibold tabular-nums text-ink/35">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] ${
                    l.done ? "text-ink/50" : "text-bright"
                  }`}
                >
                  {l.title}
                </span>
                <span className="flex flex-none items-center gap-1.5">
                  {stages.map((s) => (
                    <span
                      key={s.label}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        s.on ? "bg-ok/10 text-ok" : "bg-white/5 text-ink/35"
                      }`}
                    >
                      {s.on ? "✓ " : ""}
                      {s.label}
                    </span>
                  ))}
                </span>
                <span className="flex-none text-[12px] text-ink/40 transition-colors group-hover:text-accent">
                  {l.done ? "Replay ›" : "Open ›"}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href="/cpptutor"
        className="text-[13px] font-medium text-accent transition-colors hover:text-[#409cff]"
      >
        ‹ Skill tree
      </Link>
    </div>
  );
}
