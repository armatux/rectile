import Link from "next/link";
import { SectionHeader } from "@/components/hud";
import { LessonPlayer } from "@/components/tutor/LessonPlayer";
import type { BridgeLesson } from "@/lib/cpptutor";
import { renderMarkdown } from "@/lib/markdown";
import { bridge } from "@/lib/tutorBridge";

export const dynamic = "force-dynamic";

function Fail({ sub, msg }: { sub: string; msg: string }) {
  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader label="Lesson" sub={sub} />
      <div className="glass p-6 text-[13px] leading-relaxed text-ink/60">{msg}</div>
      <Link
        href="/cpptutor"
        className="text-[13px] font-medium text-accent transition-colors hover:text-[#409cff]"
      >
        ‹ Skill tree
      </Link>
    </div>
  );
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lid: string }>;
}) {
  const { lid } = await params;
  let lesson: BridgeLesson;
  try {
    const r = await bridge<BridgeLesson>("GET", `/lesson/${lid}`);
    if (r.status === 403) {
      return <Fail sub="Locked" msg={(r.data as unknown as { error: string }).error} />;
    }
    if (r.status !== 200) {
      return <Fail sub="Not found" msg={`No lesson “${lid}” in the curriculum.`} />;
    }
    lesson = r.data;
  } catch {
    return (
      <Fail
        sub="Laptop offline"
        msg="Laptop offline — the lesson console talks to the tutor engine on the laptop. Wake the laptop (and the cpptutor-bridge service) and reload."
      />
    );
  }

  const readingHtml = renderMarkdown(lesson.body);

  return (
    <div className="flex flex-col gap-5 pt-5">
      <SectionHeader
        label={`${lesson.track.icon} ${lesson.id}`}
        sub={`${lesson.track.title} · ${lesson.module.title}`}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-bright">
          {lesson.title}
        </h1>
        <span className="text-[12px] tabular-nums text-ink/50">
          L{lesson.player.level} · {lesson.player.xp} XP
        </span>
      </div>

      <LessonPlayer lesson={lesson} readingHtml={readingHtml} />

      <Link
        href={`/cpptutor/module/${lesson.module.id}`}
        className="text-[13px] font-medium text-accent transition-colors hover:text-[#409cff]"
      >
        ‹ {lesson.module.title}
      </Link>
    </div>
  );
}
