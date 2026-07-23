import Link from "next/link";
import { ProgressBar, SectionHeader } from "@/components/hud";
import type { BridgeTree } from "@/lib/cpptutor";
import { bridge } from "@/lib/tutorBridge";

export const dynamic = "force-dynamic";

function LinkDown() {
  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader label="LESSON CONSOLE" sub="LAPTOP.LINK" />
      <div className="hud-panel p-6 text-[11.5px] leading-relaxed text-ink/60">
        LAPTOP LINK DOWN — the lesson console talks to the tutor engine on the
        laptop. Wake the laptop (and the cpptutor-bridge service) and reload.
      </div>
      <Link href="/cpptutor" className="text-[10px] font-bold tracking-[0.22em] text-ink/50 hover:text-accent">
        ◂ BACK TO SKILL TREE
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
        <SectionHeader label="LESSON CONSOLE" sub="NOT.FOUND" />
        <div className="hud-panel p-6 text-[11.5px] text-ink/60">
          No module “{mid}” in the curriculum.
        </div>
      </div>
    );
  }

  const locked = !track.unlocked || !mod.unlocked;

  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader
        label={`${track.icon} ${mod.id.toUpperCase()} — LESSON CONSOLE`}
        sub={track.title.toUpperCase()}
      />

      <div className="hud-panel flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1
            className="font-display text-[20px] font-bold text-bright"
            style={{ textShadow: "0 0 24px rgb(150 110 255 / 0.4)" }}
          >
            {mod.title}
            {mod.mastered && (
              <span className="ml-2 text-warn" title="boss fight mastered">★</span>
            )}
          </h1>
          <span className="text-[10px] font-semibold tracking-[0.08em] text-ink/70">
            {mod.done} / {mod.total} LESSONS
          </span>
        </div>
        {mod.description && (
          <p className="text-[11.5px] leading-relaxed text-ink/60">{mod.description}</p>
        )}
        <ProgressBar built={mod.done} total={mod.total} height={4} />
        {tree.terminal_session && (
          <p className="text-[9.5px] tracking-[0.14em] text-warn">
            ⚠ A TERMINAL SESSION IS RUNNING ON THE LAPTOP — PROGRESS HERE IS
            READ-ONLY UNTIL IT ENDS.
          </p>
        )}
      </div>

      {locked ? (
        <div className="hud-panel p-6 text-[11px] leading-relaxed text-ink/50">
          ⛓ MODULE LOCKED
          {mod.requires.length > 0 && (
            <span className="mt-1 block">needs: {mod.requires.join(", ")}</span>
          )}
          {!track.unlocked && track.unlock_hint && (
            <span className="mt-1 block">track: {track.unlock_hint}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {mod.lessons.map((l, i) => {
            const stages = [
              { label: "READ", on: l.read, always: true },
              { label: "QUIZ", on: l.quiz_done, always: l.has_quiz },
              { label: "FORGE", on: l.exercise_done, always: l.has_exercise },
            ].filter((s) => s.always);
            return (
              <Link
                key={l.id}
                href={`/cpptutor/lesson/${l.id}`}
                className="hud-panel group flex items-center gap-4 px-4 py-3 transition-colors hover:border-line-strong"
              >
                <span className="w-7 flex-none text-right font-display text-[15px] font-bold text-ink/40">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[12px] ${
                    l.done ? "text-ink/50" : "text-bright"
                  }`}
                >
                  {l.title}
                </span>
                <span className="flex flex-none items-center gap-1.5">
                  {stages.map((s) => (
                    <span
                      key={s.label}
                      className={`border px-1.5 py-0.5 text-[8px] font-bold tracking-[0.18em] ${
                        s.on
                          ? "border-accent/60 text-accent"
                          : "border-line text-ink/30"
                      }`}
                    >
                      {s.on ? "✓ " : ""}
                      {s.label}
                    </span>
                  ))}
                </span>
                <span className="flex-none text-[10px] text-ink/40 transition-colors group-hover:text-accent">
                  {l.done ? "REPLAY ▸" : "ENTER ▸"}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href="/cpptutor"
        className="text-[10px] font-bold tracking-[0.22em] text-ink/50 transition-colors hover:text-accent"
      >
        ◂ BACK TO SKILL TREE
      </Link>
    </div>
  );
}
