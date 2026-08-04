"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BridgeLesson,
  MutationExtras,
  PlayerHeader,
  Unlock,
} from "@/lib/cpptutor";
import { renderMarkdown } from "@/lib/markdown";
import { CodeEditor } from "./CodeEditor";

/* ---------------------------------------------------------------- helpers */

async function tapi<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T & MutationExtras & { error?: string } }> {
  const res = await fetch(`/tutor/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-cpptutor": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

type FeedItem =
  | { kind: "event"; text: string }
  | { kind: "unlock"; unlock: Unlock }
  | { kind: "primer"; text: string }
  | { kind: "warn"; text: string };

function eventStyle(text: string) {
  if (text.includes("LEVEL UP")) return "text-warn font-semibold";
  if (text.startsWith("+") && text.includes("XP")) return "text-accent font-medium";
  if (text.startsWith("−") && text.includes("XP")) return "text-warn";
  if (text.includes("streak")) return "text-ok";
  return "text-ink/70";
}

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

function Feed({ items }: { items: FeedItem[] }) {
  if (!items.length) return null;
  return (
    <div className="glass flex flex-col gap-1.5 p-3 fade-in">
      {items.map((it, i) =>
        it.kind === "unlock" ? (
          <p key={i} className="text-[12px] font-semibold text-warn">
            ★ Unlocked — {it.unlock.title} ({it.unlock.kind})
          </p>
        ) : it.kind === "primer" ? (
          <details key={i} className="text-[12px] text-ink/70">
            <summary className="cursor-pointer text-accent">
              The tutor left a primer — read it
            </summary>
            <div
              className="md mt-2 rounded-xl border border-line bg-white/[0.03] p-3"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(it.text) }}
            />
          </details>
        ) : (
          <p
            key={i}
            className={`text-[12px] ${
              it.kind === "warn" ? "text-danger" : eventStyle(it.text)
            }`}
          >
            {it.text}
          </p>
        ),
      )}
    </div>
  );
}

function Btn({
  onClick,
  children,
  tone = "normal",
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "normal" | "primary" | "danger";
  disabled?: boolean;
}) {
  const toneCls =
    tone === "primary"
      ? "btn-tint"
      : tone === "danger"
        ? "inline-flex items-center justify-center gap-1.5 rounded-full bg-danger/15 px-4 text-[13px] font-medium text-danger transition-colors hover:bg-danger/25"
        : "btn-quiet";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${toneCls} min-h-[38px] disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ quiz */

type QuizQuestion = { qi: number; q: string; choices: string[] };
type QuizState = {
  total: number;
  question: QuizQuestion | null;
  alreadyDone: boolean;
  lastExplain: string;
  lastWrong: boolean;
  finished: boolean;
  firstTry: number;
  awaitNext: boolean;
};

function QuizPanel({
  lid,
  onExtras,
  onDone,
}: {
  lid: string;
  onExtras: (d: MutationExtras) => void;
  onDone: () => void;
}) {
  const [qs, setQs] = useState<QuizState | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    tapi<{ total: number; already_done: boolean; question: QuizQuestion }>(
      "POST",
      `quiz/${lid}/start`,
    ).then(({ status, data }) => {
      if (status !== 200) return setErr(data.error ?? "quiz unavailable");
      setQs({
        total: data.total,
        question: data.question,
        alreadyDone: data.already_done,
        lastExplain: "",
        lastWrong: false,
        finished: false,
        firstTry: 0,
        awaitNext: false,
      });
    });
  }, [lid]);

  const answer = useCallback(
    async (pick: number) => {
      if (!qs || busy) return;
      setBusy(true);
      const { status, data } = await tapi<{
        correct: boolean;
        explain: string;
        finished: boolean;
        question?: QuizQuestion;
        first_try?: number;
      }>("POST", `quiz/${lid}/answer`, { pick });
      setBusy(false);
      if (status !== 200) return setErr(data.error ?? "answer failed");
      onExtras(data);
      if (!data.correct) {
        setQs({ ...qs, lastWrong: true, lastExplain: data.explain });
        return;
      }
      if (data.finished) {
        setQs({
          ...qs,
          finished: true,
          firstTry: data.first_try ?? 0,
          lastWrong: false,
          lastExplain: data.explain,
          question: null,
        });
        onDone();
        return;
      }
      setQs({
        ...qs,
        lastWrong: false,
        lastExplain: data.explain,
        question: data.question ?? null,
        awaitNext: true,
      });
    },
    [qs, busy, lid, onExtras, onDone],
  );

  if (err)
    return <p className="text-[12px] text-danger">{err}</p>;
  if (!qs)
    return <p className="text-[12px] text-ink/40 blink">Opening quiz…</p>;

  if (qs.finished) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold text-ok">
          ✓ Quiz done — {qs.firstTry}/{qs.total} on the first try
        </p>
        {qs.lastExplain && (
          <p className="text-[13px] text-ink/60">{qs.lastExplain}</p>
        )}
      </div>
    );
  }

  const q = qs.question;
  if (!q) return null;
  const letters = "abcdefgh";

  if (qs.awaitNext) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-ok">✓ Correct</p>
        {qs.lastExplain && (
          <p className="text-[13px] leading-relaxed text-ink/60">{qs.lastExplain}</p>
        )}
        <div>
          <Btn tone="primary" onClick={() => setQs({ ...qs, awaitNext: false, lastExplain: "" })}>
            Question {q.qi + 1} of {qs.total} ›
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="hud-sublabel">
          Question {q.qi + 1} of {qs.total}
        </span>
        {qs.alreadyDone && (
          <span className="text-[11px] text-ink/40">
            Replay — no XP
          </span>
        )}
      </div>
      <p className="text-[15px] font-medium leading-relaxed text-bright">{q.q}</p>
      {qs.lastWrong && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
          <p className="text-[12px] font-semibold text-danger">Not quite — try again</p>
          {qs.lastExplain && (
            <p className="mt-1 text-[12px] leading-relaxed text-ink/60">{qs.lastExplain}</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {q.choices.map((c, i) => (
          <button
            key={i}
            onClick={() => answer(i)}
            disabled={busy}
            className="min-h-[42px] rounded-xl border border-line bg-white/[0.03] px-3.5 py-2 text-left text-[13px] text-ink transition-colors hover:border-accent/60 hover:bg-white/[0.06] hover:text-bright disabled:opacity-50"
          >
            <span className="mr-2 font-semibold text-accent">{letters[i]})</span>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- exercise */

type ExPayload = {
  name: string;
  prompt: string;
  language: string;
  source: string;
  scaffold: string;
  solved: boolean;
  attempts: number;
  hints_bought: number;
  hints_total: number;
  hints: string[];
  next_hint_cost: number | null;
  solution_cost: number;
  explain_cost: number;
  perks: Record<string, boolean>;
  gate: { canonical: string; tries: number } | null;
  tool_missing: string | null;
  sanitize_armed: boolean;
  werror: boolean;
  player: PlayerHeader;
};

type TestResult = {
  label: string;
  ok: boolean;
  stdin?: string;
  timeout?: boolean;
  crashed?: boolean;
  err?: string;
  got?: string;
  expect?: string;
  contains_missing?: string[];
};

type CheckReply = {
  gate?: { canonical: string; missing?: string[]; surplus?: string[]; tries: number };
  build_ok?: boolean;
  build_output?: string;
  build_cmd?: string;
  translations?: string[];
  tests?: TestResult[];
  solved?: boolean;
  first_solve?: boolean;
};

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-ink/40">{label}</span>
      <pre className="overflow-x-auto rounded-lg border border-line bg-black/35 p-3 text-[12px] leading-relaxed text-ink">
        {text || "(empty)"}
      </pre>
    </div>
  );
}

function TestRow({ t }: { t: TestResult }) {
  return (
    <div className={`rounded-xl border p-3 ${t.ok ? "border-ok/25 bg-ok/5" : "border-danger/25 bg-danger/5"}`}>
      <p className={`text-[13px] font-semibold ${t.ok ? "text-ok" : "text-danger"}`}>
        {t.ok ? "✓" : "✗"} {t.label}
      </p>
      {!t.ok && (
        <div className="mt-2 flex flex-col gap-2">
          {t.timeout && (
            <p className="text-[12px] text-danger">
              ran too long — infinite loop? waiting for input?
            </p>
          )}
          {t.crashed && !t.timeout && (
            <p className="text-[12px] text-danger">
              crashed (non-zero exit / signal)
            </p>
          )}
          {t.err ? <Block label="stderr" text={t.err} /> : null}
          {t.stdin ? <Block label="Input given" text={t.stdin} /> : null}
          {t.expect !== undefined && (
            <div className="grid gap-2 md:grid-cols-2">
              <Block label="Your output" text={t.got ?? ""} />
              <Block label="Expected (exact)" text={t.expect} />
            </div>
          )}
          {t.contains_missing && t.contains_missing.length > 0 && (
            <>
              <Block label="Output must contain" text={t.contains_missing.join("\n")} />
              <Block label="Your output" text={t.got ?? ""} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ExercisePanel({
  lid,
  onExtras,
  onDone,
}: {
  lid: string;
  onExtras: (d: MutationExtras) => void;
  onDone: () => void;
}) {
  const [ex, setEx] = useState<ExPayload | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [check, setCheck] = useState<CheckReply | null>(null);
  const [gateInput, setGateInput] = useState("");
  const [gateInfo, setGateInfo] = useState<CheckReply["gate"] | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [nextHintCost, setNextHintCost] = useState<number | null>(null);
  const [solution, setSolution] = useState("");
  const [advices, setAdvices] = useState<string[] | null>(null);
  const [armed, setArmed] = useState("");
  const docRef = useRef("");

  const reload = useCallback(() => {
    tapi<ExPayload>("GET", `exercise/${lid}`).then(({ status, data }) => {
      if (status !== 200) return setErr(data.error ?? "exercise unavailable");
      setEx(data);
      setHints(data.hints);
      setNextHintCost(data.next_hint_cost);
      setGateInfo(data.gate ? { ...data.gate } : null);
      setEpoch((e) => e + 1);
    });
  }, [lid]);
  useEffect(reload, [reload]);

  const act = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      if (busy) return;
      setArmed("");
      setBusy(name);
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  if (err) return <p className="text-[12px] text-danger">{err}</p>;
  if (!ex)
    return <p className="text-[12px] text-ink/40 blink">Opening forge…</p>;

  const gateNeeded = gateInfo !== null && !ex.perks.autobuild;

  const doCheck = () =>
    act("check", async () => {
      setCheck(null);
      setAdvices(null);
      const body: Record<string, unknown> = { content: docRef.current };
      if (gateNeeded) {
        if (!gateInput.trim()) return; // must type the command first
        body.typed = gateInput;
      }
      const { status, data } = await tapi<CheckReply>("POST", `exercise/${lid}/check`, body);
      if (status !== 200) {
        onExtras({ events: [data.error ?? "check failed"] });
        return;
      }
      if (data.gate) {
        setGateInfo(data.gate);
        return;
      }
      setGateInfo(null);
      setCheck(data);
      onExtras(data);
      if (data.solved) {
        setEx({ ...ex, solved: true });
        onDone();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div
        className="md text-[13px]"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(ex.prompt) }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink/45">
        <span>Scaffold: {ex.scaffold}</span>
        <span>Attempts: {ex.attempts}</span>
        {ex.werror && <span className="text-warn">-Werror</span>}
        {ex.sanitize_armed && <span className="text-cyan">Sanitizers armed</span>}
        {ex.solved && <span className="text-ok">✓ Solved</span>}
        <span className="ml-auto tabular-nums">{ex.player.xp} XP</span>
      </div>

      {ex.tool_missing ? (
        <p className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger">
          No {ex.language} toolchain on the laptop — install with:{" "}
          <span className="font-mono text-[12px]">{ex.tool_missing}</span>
        </p>
      ) : (
        <>
          <CodeEditor key={epoch} initial={ex.source} language={ex.language} docRef={docRef} />

          {gateNeeded && (
            <div className="rounded-xl border border-warn/30 bg-warn/10 p-4">
              <p className="text-[12px] font-semibold text-warn">
                Your build, your command — Build automation unlocks at L5.
                Type the command to run the check:
              </p>
              <p className="mt-1.5 font-mono text-[12px] text-ink/60">{gateInfo?.canonical}</p>
              <input
                value={gateInput}
                onChange={(e) => setGateInput(e.target.value)}
                placeholder="$ type it here"
                className="field mt-2 font-mono"
              />
              {(gateInfo?.missing?.length || gateInfo?.surplus?.length) ? (
                <div className="mt-1.5 text-[12px]">
                  {gateInfo?.missing?.length ? (
                    <p className="text-danger">missing: {gateInfo.missing.join(" ")}</p>
                  ) : null}
                  {gateInfo?.surplus?.length ? (
                    <p className="text-danger">not in the command: {gateInfo.surplus.join(" ")}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Btn tone="primary" onClick={doCheck} disabled={busy !== null}>
              {busy === "check" ? "Building…" : "Build and test"}
            </Btn>
            <Btn
              onClick={() =>
                act("save", async () => {
                  await tapi("PUT", `exercise/${lid}/source`, { content: docRef.current });
                  onExtras({ events: ["file synced to the laptop workspace"] });
                })
              }
              disabled={busy !== null}
            >
              Sync file
            </Btn>
            {nextHintCost !== null &&
              (armed === "hint" ? (
                <Btn
                  tone="danger"
                  onClick={() =>
                    act("hint", async () => {
                      const { data } = await tapi<{
                        hints: string[];
                        next_hint_cost: number | null;
                      }>("POST", `exercise/${lid}/hint`);
                      onExtras(data);
                      if (data.hints) setHints(data.hints);
                      setNextHintCost(data.next_hint_cost ?? null);
                    })
                  }
                >
                  Confirm −{nextHintCost} XP
                </Btn>
              ) : (
                <Btn onClick={() => setArmed("hint")}>
                  Hint {hints.length + 1} ({nextHintCost} XP)
                </Btn>
              ))}
            {!solution &&
              (ex.solution_cost === 0 ? (
                <Btn
                  onClick={() =>
                    act("solution", async () => {
                      const { data } = await tapi<{ solution?: string }>(
                        "POST",
                        `exercise/${lid}/solution`,
                      );
                      if (data.solution) setSolution(data.solution);
                    })
                  }
                >
                  Solution (free)
                </Btn>
              ) : armed === "solution" ? (
                <Btn
                  tone="danger"
                  onClick={() =>
                    act("solution", async () => {
                      const { data } = await tapi<{ solution?: string }>(
                        "POST",
                        `exercise/${lid}/solution`,
                        { confirm: true },
                      );
                      onExtras(data);
                      if (data.solution) setSolution(data.solution);
                    })
                  }
                >
                  Confirm −{ex.solution_cost} XP + no-help bonus
                </Btn>
              ) : (
                <Btn onClick={() => setArmed("solution")}>
                  Solution ({ex.solution_cost} XP)
                </Btn>
              ))}
            <Btn
              onClick={() =>
                act("explain", async () => {
                  const { data } = await tapi<{ advices?: string[]; note?: string }>(
                    "POST",
                    `exercise/${lid}/explain`,
                  );
                  onExtras(data);
                  setAdvices(data.advices ?? []);
                  if (data.note) onExtras({ events: [data.note] });
                })
              }
              disabled={busy !== null}
            >
              Explain error ({ex.explain_cost === 0 ? "free" : `${ex.explain_cost} XP`})
            </Btn>
            {armed === "reset" ? (
              <Btn
                tone="danger"
                onClick={() =>
                  act("reset", async () => {
                    const { data } = await tapi<{ source?: string }>(
                      "POST",
                      `exercise/${lid}/reset`,
                    );
                    if (data.source !== undefined) {
                      setEx({ ...ex, source: data.source });
                      setEpoch((e) => e + 1);
                      setCheck(null);
                    }
                  })
                }
              >
                Confirm overwrite
              </Btn>
            ) : (
              <Btn onClick={() => setArmed("reset")}>Reset file</Btn>
            )}
          </div>

          {hints.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-white/[0.03] p-3">
              {hints.map((h, i) => (
                <p key={i} className="text-[12px] leading-relaxed text-ink/80">
                  <span className="mr-1.5 font-semibold text-warn">Hint {i + 1}</span>
                  {h}
                </p>
              ))}
            </div>
          )}

          {advices && advices.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-cyan/25 bg-cyan/5 p-3">
              {advices.map((a, i) => (
                <p key={i} className="text-[12px] leading-relaxed text-ink/80">
                  {a}
                </p>
              ))}
            </div>
          )}

          {solution && (
            <div className="flex flex-col gap-1">
              <span className="hud-sublabel">Solution — study it, then write yours</span>
              <pre className="overflow-x-auto rounded-xl border border-line bg-black/35 p-3 text-[12px] leading-relaxed text-ink">
                {solution}
              </pre>
            </div>
          )}

          {check && (
            <div className="flex flex-col gap-2.5 fade-in">
              {check.build_cmd && (
                <p className="font-mono text-[12px] text-ink/40">$ {check.build_cmd}</p>
              )}
              {check.build_ok === false ? (
                <>
                  <p className="text-[13px] font-semibold text-danger">
                    Build failed — read the first error, fix it, check again
                  </p>
                  <Block label="Compiler output" text={check.build_output ?? ""} />
                  {check.translations && check.translations.length > 0 && (
                    <div className="flex flex-col gap-1.5 rounded-xl border border-cyan/25 bg-cyan/5 p-3">
                      {check.translations.map((a, i) => (
                        <p key={i} className="text-[12px] leading-relaxed text-ink/80">
                          {a}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {check.build_output?.trim() ? (
                    <Block label="Compiler warnings" text={check.build_output} />
                  ) : (
                    <p className="text-[12px] font-semibold text-ok">✓ Build clean</p>
                  )}
                  <div className="flex flex-col gap-2">
                    {check.tests?.map((t, i) => <TestRow key={i} t={t} />)}
                  </div>
                  {check.solved && (
                    <p className="text-[15px] font-semibold text-ok">
                      ✓ All tests pass — exercise solved
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- player */

export function LessonPlayer({
  lesson,
  readingHtml,
}: {
  lesson: BridgeLesson;
  readingHtml: string;
}) {
  const [flags, setFlags] = useState({
    read: lesson.read,
    quiz_done: lesson.quiz_done,
    exercise_done: lesson.exercise_done,
  });
  const [stage, setStage] = useState<"read" | "quiz" | "exercise">(() => {
    if (!lesson.read) return "read";
    if (lesson.has_quiz && !lesson.quiz_done) return "quiz";
    if (lesson.has_exercise && !lesson.exercise_done) return "exercise";
    return "read"; // finished lessons replay from the top
  });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);

  const pushExtras = useCallback((d: MutationExtras) => {
    const items: FeedItem[] = [];
    for (const e of d.events ?? []) items.push({ kind: "event", text: e });
    for (const u of d.unlocks ?? []) items.push({ kind: "unlock", unlock: u });
    for (const p of d.primers ?? []) items.push({ kind: "primer", text: p });
    if (items.length) setFeed((f) => [...items, ...f].slice(0, 30));
  }, []);

  const stages: { key: "read" | "quiz" | "exercise"; label: string; done: boolean; open: boolean }[] = [
    { key: "read", label: "Reading", done: flags.read, open: true },
    ...(lesson.has_quiz
      ? [{ key: "quiz" as const, label: "Quiz", done: flags.quiz_done, open: flags.read }]
      : []),
    ...(lesson.has_exercise
      ? [
          {
            key: "exercise" as const,
            label: "Forge",
            done: flags.exercise_done,
            open: flags.read && (!lesson.has_quiz || flags.quiz_done),
          },
        ]
      : []),
  ];

  const markRead = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const { status, data } = await tapi("POST", `lesson/${lesson.id}/read`);
    setBusy(false);
    if (status !== 200) {
      setFeed((f) => [{ kind: "warn", text: data.error ?? "failed" }, ...f]);
      return;
    }
    pushExtras(data);
    setFlags((fl) => ({ ...fl, read: true }));
    if (lesson.has_quiz && !flags.quiz_done) setStage("quiz");
    else if (lesson.has_exercise && !flags.exercise_done) setStage("exercise");
  }, [busy, lesson, flags, pushExtras]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {stages.map((s, i) => (
          <button
            key={s.key}
            onClick={() => s.open && setStage(s.key)}
            disabled={!s.open}
            className={`flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors ${
              stage === s.key
                ? "bg-accent/15 text-bright"
                : s.open
                  ? "bg-white/5 text-ink/60 hover:bg-white/10 hover:text-bright"
                  : "bg-white/[0.03] text-ink/30"
            }`}
          >
            <span className={s.done ? "text-ok" : "text-ink/40"}>
              {s.done ? "✓" : `${i + 1}`}
            </span>
            {s.label}
            {!s.open && <LockIcon className="opacity-60" />}
          </button>
        ))}
      </div>

      <Feed items={feed} />

      {stage === "read" && (
        <div className="glass flex flex-col gap-4 p-5">
          <div className="md" dangerouslySetInnerHTML={{ __html: readingHtml }} />
          <div>
            {flags.read ? (
              <span className="text-[13px] font-semibold text-ok">
                ✓ Read
                {lesson.has_quiz || lesson.has_exercise ? (
                  <button
                    className="ml-4 font-medium text-accent transition-colors hover:text-[#409cff]"
                    onClick={() =>
                      setStage(lesson.has_quiz && !flags.quiz_done ? "quiz" : "exercise")
                    }
                  >
                    Continue ›
                  </button>
                ) : null}
              </span>
            ) : (
              <Btn tone="primary" onClick={markRead} disabled={busy}>
                {busy ? "…" : "Mark as read"}
              </Btn>
            )}
          </div>
        </div>
      )}

      {stage === "quiz" && (
        <div className="glass p-5">
          <QuizPanel
            lid={lesson.id}
            onExtras={pushExtras}
            onDone={() => setFlags((fl) => ({ ...fl, quiz_done: true }))}
          />
        </div>
      )}

      {stage === "exercise" && (
        <div className="glass p-5">
          <ExercisePanel
            lid={lesson.id}
            onExtras={pushExtras}
            onDone={() => setFlags((fl) => ({ ...fl, exercise_done: true }))}
          />
        </div>
      )}
    </div>
  );
}
