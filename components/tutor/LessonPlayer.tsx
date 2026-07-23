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
  if (text.includes("LEVEL UP")) return "text-warn font-bold";
  if (text.startsWith("+") && text.includes("XP")) return "text-accent font-semibold";
  if (text.startsWith("−") && text.includes("XP")) return "text-warn";
  if (text.includes("streak")) return "text-ok";
  return "text-ink/70";
}

function Feed({ items }: { items: FeedItem[] }) {
  if (!items.length) return null;
  return (
    <div className="hud-panel flex flex-col gap-1.5 p-3 fade-in">
      {items.map((it, i) =>
        it.kind === "unlock" ? (
          <p key={i} className="text-[11px] font-bold tracking-[0.14em] text-warn">
            ★ UNLOCKED — {it.unlock.title.toUpperCase()} ({it.unlock.kind})
          </p>
        ) : it.kind === "primer" ? (
          <details key={i} className="text-[10.5px] text-ink/70">
            <summary className="cursor-pointer text-accent">
              📖 the tutor left a primer — read it
            </summary>
            <div
              className="md mt-2 border border-line p-3"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(it.text) }}
            />
          </details>
        ) : (
          <p
            key={i}
            className={`text-[10.5px] tracking-[0.06em] ${
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
      ? "border-accent/60 text-accent hover:bg-accent/10"
      : tone === "danger"
        ? "border-danger/40 text-danger/80 hover:bg-danger/10"
        : "border-line text-ink/70 hover:text-bright hover:border-line-strong";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[38px] border px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneCls}`}
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
    return <p className="text-[11px] text-danger">{err}</p>;
  if (!qs)
    return <p className="text-[10px] tracking-[0.2em] text-ink/40 blink">OPENING QUIZ…</p>;

  if (qs.finished) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-bold text-ok">
          ✓ QUIZ DONE — {qs.firstTry}/{qs.total} ON THE FIRST TRY
        </p>
        {qs.lastExplain && (
          <p className="text-[11px] text-ink/60">{qs.lastExplain}</p>
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
        <p className="text-[12px] font-bold text-ok">✓ correct</p>
        {qs.lastExplain && (
          <p className="text-[11px] leading-relaxed text-ink/60">{qs.lastExplain}</p>
        )}
        <div>
          <Btn tone="primary" onClick={() => setQs({ ...qs, awaitNext: false, lastExplain: "" })}>
            QUESTION {q.qi + 1} / {qs.total} ▸
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="hud-sublabel">
          QUESTION {q.qi + 1} / {qs.total}
        </span>
        {qs.alreadyDone && (
          <span className="text-[9px] tracking-[0.18em] text-ink/40">
            REPLAY — NO XP
          </span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-bright">{q.q}</p>
      {qs.lastWrong && (
        <div className="border border-danger/30 bg-danger/5 p-2.5">
          <p className="text-[11px] font-bold text-danger">✗ not quite — try again</p>
          {qs.lastExplain && (
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink/60">{qs.lastExplain}</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {q.choices.map((c, i) => (
          <button
            key={i}
            onClick={() => answer(i)}
            disabled={busy}
            className="min-h-[42px] border border-line px-3 py-2 text-left text-[11.5px] text-ink transition-colors hover:border-accent/60 hover:text-bright disabled:opacity-50"
          >
            <span className="mr-2 font-bold text-accent">{letters[i]})</span>
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
      <span className="text-[8.5px] font-bold tracking-[0.2em] text-ink/40">{label}</span>
      <pre className="overflow-x-auto border border-line bg-void/60 p-2 text-[11px] leading-relaxed text-ink">
        {text || "(empty)"}
      </pre>
    </div>
  );
}

function TestRow({ t }: { t: TestResult }) {
  return (
    <div className={`border p-2.5 ${t.ok ? "border-ok/30" : "border-danger/30"}`}>
      <p className={`text-[11px] font-bold ${t.ok ? "text-ok" : "text-danger"}`}>
        {t.ok ? "✓" : "✗"} {t.label}
      </p>
      {!t.ok && (
        <div className="mt-2 flex flex-col gap-2">
          {t.timeout && (
            <p className="text-[10.5px] text-danger">
              ran too long — infinite loop? waiting for input?
            </p>
          )}
          {t.crashed && !t.timeout && (
            <p className="text-[10.5px] text-danger">
              crashed (non-zero exit / signal)
            </p>
          )}
          {t.err ? <Block label="STDERR" text={t.err} /> : null}
          {t.stdin ? <Block label="INPUT GIVEN" text={t.stdin} /> : null}
          {t.expect !== undefined && (
            <div className="grid gap-2 md:grid-cols-2">
              <Block label="YOUR OUTPUT" text={t.got ?? ""} />
              <Block label="EXPECTED (EXACT)" text={t.expect} />
            </div>
          )}
          {t.contains_missing && t.contains_missing.length > 0 && (
            <>
              <Block label="OUTPUT MUST CONTAIN" text={t.contains_missing.join("\n")} />
              <Block label="YOUR OUTPUT" text={t.got ?? ""} />
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

  if (err) return <p className="text-[11px] text-danger">{err}</p>;
  if (!ex)
    return <p className="text-[10px] tracking-[0.2em] text-ink/40 blink">OPENING FORGE…</p>;

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
        className="md text-[12px]"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(ex.prompt) }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] tracking-[0.16em] text-ink/40">
        <span>SCAFFOLD: {ex.scaffold.toUpperCase()}</span>
        <span>ATTEMPTS: {ex.attempts}</span>
        {ex.werror && <span className="text-warn">-WERROR</span>}
        {ex.sanitize_armed && <span className="text-cyan">SANITIZERS ARMED</span>}
        {ex.solved && <span className="text-ok">✓ SOLVED</span>}
        <span className="ml-auto">XP {ex.player.xp}</span>
      </div>

      {ex.tool_missing ? (
        <p className="border border-danger/30 p-3 text-[11px] text-danger">
          no {ex.language} toolchain on the laptop — install with: {ex.tool_missing}
        </p>
      ) : (
        <>
          <CodeEditor key={epoch} initial={ex.source} language={ex.language} docRef={docRef} />

          {gateNeeded && (
            <div className="border border-warn/40 bg-warn/5 p-3">
              <p className="text-[10px] font-bold tracking-[0.18em] text-warn">
                ⚒ YOUR BUILD, YOUR COMMAND — Build Automation unlocks at L5.
                TYPE THE COMMAND TO RUN THE CHECK:
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-ink/60">{gateInfo?.canonical}</p>
              <input
                value={gateInput}
                onChange={(e) => setGateInput(e.target.value)}
                placeholder="$ type it here"
                className="mt-2 min-h-[38px] w-full border border-line bg-void/60 px-2 font-mono text-[11.5px] text-bright focus:border-line-strong focus:outline-none"
              />
              {(gateInfo?.missing?.length || gateInfo?.surplus?.length) ? (
                <div className="mt-1.5 text-[10px]">
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
              {busy === "check" ? "FORGING…" : "⚒ CHECK — BUILD + TESTS"}
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
              SYNC FILE
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
                  CONFIRM −{nextHintCost} XP
                </Btn>
              ) : (
                <Btn onClick={() => setArmed("hint")}>
                  💡 HINT #{hints.length + 1} ({nextHintCost} XP)
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
                  SOLUTION (STUDY, FREE)
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
                  CONFIRM −{ex.solution_cost} XP + NO-HELP BONUS
                </Btn>
              ) : (
                <Btn onClick={() => setArmed("solution")}>
                  SOLUTION ({ex.solution_cost} XP)
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
              ◈ EXPLAIN ERROR ({ex.explain_cost === 0 ? "FREE" : `${ex.explain_cost} XP`})
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
                CONFIRM OVERWRITE
              </Btn>
            ) : (
              <Btn onClick={() => setArmed("reset")}>RESET FILE</Btn>
            )}
          </div>

          {hints.length > 0 && (
            <div className="flex flex-col gap-1 border border-line p-3">
              {hints.map((h, i) => (
                <p key={i} className="text-[11px] text-ink/80">
                  <span className="mr-1.5 text-warn">💡</span>
                  {h}
                </p>
              ))}
            </div>
          )}

          {advices && advices.length > 0 && (
            <div className="flex flex-col gap-1 border border-cyan/30 p-3">
              {advices.map((a, i) => (
                <p key={i} className="text-[11px] text-ink/80">
                  <span className="mr-1.5 text-cyan">◈</span>
                  {a}
                </p>
              ))}
            </div>
          )}

          {solution && (
            <div className="flex flex-col gap-1">
              <span className="hud-sublabel">SOLUTION — STUDY IT, THEN WRITE YOURS</span>
              <pre className="overflow-x-auto border border-accent/30 bg-void/60 p-3 text-[11.5px] leading-relaxed text-ink">
                {solution}
              </pre>
            </div>
          )}

          {check && (
            <div className="flex flex-col gap-2.5 fade-in">
              {check.build_cmd && (
                <p className="font-mono text-[10px] text-ink/40">$ {check.build_cmd}</p>
              )}
              {check.build_ok === false ? (
                <>
                  <p className="text-[11.5px] font-bold text-danger">
                    ✗ BUILD FAILED — read the first error, fix it, check again
                  </p>
                  <Block label="COMPILER" text={check.build_output ?? ""} />
                  {check.translations && check.translations.length > 0 && (
                    <div className="flex flex-col gap-1 border border-cyan/30 p-3">
                      {check.translations.map((a, i) => (
                        <p key={i} className="text-[11px] text-ink/80">
                          <span className="mr-1.5 text-cyan">◈</span>
                          {a}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {check.build_output?.trim() ? (
                    <Block label="COMPILER (WARNINGS)" text={check.build_output} />
                  ) : (
                    <p className="text-[11px] font-bold text-ok">✓ build clean</p>
                  )}
                  <div className="flex flex-col gap-2">
                    {check.tests?.map((t, i) => <TestRow key={i} t={t} />)}
                  </div>
                  {check.solved && (
                    <p className="text-[14px] font-bold text-ok">
                      ✓ ALL TESTS PASS — EXERCISE SOLVED
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
    { key: "read", label: "READING", done: flags.read, open: true },
    ...(lesson.has_quiz
      ? [{ key: "quiz" as const, label: "QUIZ", done: flags.quiz_done, open: flags.read }]
      : []),
    ...(lesson.has_exercise
      ? [
          {
            key: "exercise" as const,
            label: "FORGE",
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
            className={`flex min-h-[38px] items-center gap-1.5 border px-3 text-[10px] font-bold tracking-[0.2em] transition-colors ${
              stage === s.key
                ? "border-accent/70 text-bright"
                : s.open
                  ? "border-line text-ink/50 hover:text-accent"
                  : "border-line text-ink/25"
            }`}
          >
            <span className={s.done ? "text-ok" : "text-ink/30"}>
              {s.done ? "✓" : `${i + 1}`}
            </span>
            {s.label}
            {!s.open && " 🔒"}
          </button>
        ))}
      </div>

      <Feed items={feed} />

      {stage === "read" && (
        <div className="hud-panel flex flex-col gap-4 p-5">
          <div className="md" dangerouslySetInnerHTML={{ __html: readingHtml }} />
          <div>
            {flags.read ? (
              <span className="text-[10px] font-bold tracking-[0.2em] text-ok">
                ✓ READ
                {lesson.has_quiz || lesson.has_exercise ? (
                  <button
                    className="ml-4 text-accent hover:text-bright"
                    onClick={() =>
                      setStage(lesson.has_quiz && !flags.quiz_done ? "quiz" : "exercise")
                    }
                  >
                    CONTINUE ▸
                  </button>
                ) : null}
              </span>
            ) : (
              <Btn tone="primary" onClick={markRead} disabled={busy}>
                {busy ? "…" : "MARK READ ▸"}
              </Btn>
            )}
          </div>
        </div>
      )}

      {stage === "quiz" && (
        <div className="hud-panel p-5">
          <QuizPanel
            lid={lesson.id}
            onExtras={pushExtras}
            onDone={() => setFlags((fl) => ({ ...fl, quiz_done: true }))}
          />
        </div>
      )}

      {stage === "exercise" && (
        <div className="hud-panel p-5">
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
