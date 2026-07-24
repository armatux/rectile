"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbBus } from "./OrbCanvas";
import { VOICE_COLOR, type VoiceState } from "./voice";

/* Minimal typings for the (webkit-prefixed) SpeechRecognition API */
type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecogEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecogEvent = {
  resultIndex: number;
  results: { length: number; [i: number]: { [j: number]: { transcript: string } } };
};

/** Bottom-left assistant dock: rotating typed briefs, optional mic with a
 *  "rectile" wake word (degrades gracefully where SpeechRecognition is
 *  unavailable — Brave, iOS PWA), spoken responses via speechSynthesis. */
export function VoiceDock({
  briefs,
  voice,
  setVoice,
  bus,
}: {
  briefs: string[];
  voice: VoiceState;
  setVoice: (v: VoiceState) => void;
  bus: React.MutableRefObject<OrbBus>;
}) {
  const [typed, setTyped] = useState("");
  const [micOn, setMicOn] = useState(false);

  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const micRef = useRef(micOn);
  micRef.current = micOn;

  const briefIdx = useRef(0);
  const pos = useRef(0);
  const typeT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const respT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dead = useRef(false);
  const recog = useRef<Recog | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);

  /* ---- typed brief loop ---- */
  const typeLoop = useCallback(() => {
    const full = briefs[briefIdx.current % briefs.length] ?? "";
    if (pos.current < full.length) {
      pos.current += 2;
      setTyped(full.slice(0, pos.current));
      typeT.current = setTimeout(typeLoop, 24);
    } else {
      typeT.current = setTimeout(() => advance(), 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefs]);

  const advance = useCallback(() => {
    clearTimeout(typeT.current);
    briefIdx.current = (briefIdx.current + 1) % briefs.length;
    pos.current = 0;
    setTyped("");
    typeT.current = setTimeout(typeLoop, 300);
  }, [briefs, typeLoop]);

  useEffect(() => {
    dead.current = false;
    typeLoop();
    return () => {
      dead.current = true;
      clearTimeout(typeT.current);
      clearTimeout(respT.current);
      clearTimeout(failT.current);
      if (recog.current) try { recog.current.stop(); } catch {}
      stream.current?.getTracks().forEach((t) => t.stop());
      if (audio.current) try { void audio.current.close(); } catch {}
      window.speechSynthesis?.cancel();
    };
  }, [typeLoop]);

  /* ---- responding: speak the current brief ---- */
  const respond = useCallback(() => {
    if (voiceRef.current === "responding") return;
    setVoice("responding");
    const started = performance.now();
    const done = () => {
      if (!dead.current) setVoice("idle");
    };
    const fallback = () => {
      clearTimeout(respT.current);
      const left = Math.max(0, 5000 - (performance.now() - started));
      respT.current = setTimeout(done, left);
    };
    const text = briefs[briefIdx.current % briefs.length] ?? "";
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.04;
        u.pitch = 0.85;
        u.onend = () => {
          if (performance.now() - started > 1000) done();
          else fallback();
        };
        u.onerror = fallback;
        window.speechSynthesis.speak(u);
        failT.current = setTimeout(() => {
          if (voiceRef.current === "responding" && !window.speechSynthesis.speaking)
            fallback();
        }, 1500);
        return;
      } catch {}
    }
    respT.current = setTimeout(done, 5000);
  }, [briefs, setVoice]);

  /* silence while listening (detected in the orb draw loop) → respond */
  useEffect(() => {
    bus.current.onSilence = () => {
      if (voiceRef.current === "listening") respond();
    };
  }, [bus, respond]);

  const wake = useCallback(() => setVoice("listening"), [setVoice]);

  /* ---- mic + wake word ---- */
  const startRecog = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recog;
      webkitSpeechRecognition?: new () => Recog;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const r = new SR();
      recog.current = r;
      r.continuous = true;
      r.interimResults = true;
      r.lang = "en-US";
      r.onresult = (e) => {
        let tx = "";
        for (let i = e.resultIndex; i < e.results.length; i++)
          tx += e.results[i][0].transcript;
        tx = tx.toLowerCase();
        if (
          voiceRef.current === "idle" &&
          (tx.includes("rectile") ||
            tx.includes("reptile") ||
            tx.includes("rec tile") ||
            tx.includes("wreck"))
        )
          wake();
      };
      r.onend = () => {
        if (!dead.current && micRef.current) {
          try { r.start(); } catch {}
        }
      };
      r.start();
    } catch {}
  }, [wake]);

  const startVoice = useCallback(async () => {
    if (micRef.current) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      const src = ac.createMediaStreamSource(s);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      audio.current = ac;
      stream.current = s;
      bus.current.analyser = an;
      setMicOn(true);
      startRecog();
    } catch {
      setMicOn(false);
    }
  }, [bus, startRecog]);

  /* ---- SIM cycle: wake → reply → end, no mic needed ---- */
  const simCycle = useCallback(() => {
    const v = voiceRef.current;
    if (v === "idle") wake();
    else if (v === "listening") respond();
    else {
      window.speechSynthesis?.cancel();
      clearTimeout(respT.current);
      setVoice("idle");
    }
  }, [wake, respond, setVoice]);

  const vColor = VOICE_COLOR[voice];
  const simLabel = { idle: "SIM WAKE", listening: "SIM REPLY", responding: "SIM END" }[voice];

  return (
    <div className="flex max-w-[300px] flex-col gap-2 border border-line bg-[rgb(10_6_20/0.9)] px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={advance}
          aria-label="next brief"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border bg-panel/80 text-[12px] font-bold transition-colors hover:text-bright"
          style={{ borderColor: vColor, color: vColor }}
        >
          R
        </button>
        <span className="max-h-[31px] overflow-hidden text-[9.5px] leading-[1.6] text-ink/60">
          {typed}
          <span className="blink ml-0.5 inline-block h-2.5 w-[5px] bg-accent align-middle" />
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={startVoice}
          className="whitespace-nowrap border border-line bg-panel/85 px-2 py-1 text-[8px] font-medium tracking-[0.16em] transition-colors hover:border-line-strong"
          style={{ color: micOn ? "var(--color-ok)" : "rgb(217 210 236 / 0.7)" }}
        >
          ● {micOn ? "MIC LIVE" : "ENABLE MIC"}
        </button>
        <button
          onClick={simCycle}
          className="whitespace-nowrap border border-line bg-panel/85 px-2 py-1 text-[8px] font-medium tracking-[0.16em] text-ink/70 transition-colors hover:border-line-strong hover:text-bright"
        >
          {simLabel}
        </button>
      </div>
    </div>
  );
}
