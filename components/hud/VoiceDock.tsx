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
 *  "scala" wake word (degrades gracefully where SpeechRecognition is
 *  unavailable — Brave, iOS PWA), spoken responses via speechSynthesis. */
export function VoiceDock({
  briefs,
  voice,
  setVoice,
  bus,
  interpret,
}: {
  briefs: string[];
  voice: VoiceState;
  setVoice: (v: VoiceState) => void;
  bus: React.MutableRefObject<OrbBus>;
  /** command grammar — returns the spoken ack when a command was executed */
  interpret?: (transcript: string) => string | null;
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

  /* ---- responding: speak a command ack, or the current brief ---- */
  const heard = useRef("");
  const respond = useCallback((say?: string) => {
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
    const text = say ?? briefs[briefIdx.current % briefs.length] ?? "";
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

  /* silence while listening (detected in the orb draw loop) → try a command
     from what was heard since the wake word, else speak the brief */
  useEffect(() => {
    bus.current.onSilence = () => {
      if (voiceRef.current !== "listening") return;
      const tx = heard.current;
      heard.current = "";
      const ack = tx && interpret ? interpret(tx) : null;
      respond(ack ?? undefined);
    };
  }, [bus, respond, interpret]);

  const wake = useCallback(() => {
    heard.current = "";
    setVoice("listening");
  }, [setVoice]);

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
          (tx.includes("scala") ||
            tx.includes("scaler") ||
            tx.includes("skala") ||
            tx.includes("scholar"))
        ) {
          wake();
          return;
        }
        // while listening, remember what was said — commands parse on silence
        if (voiceRef.current === "listening") heard.current = tx;
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
  const simLabel = { idle: "Simulate wake", listening: "Simulate reply", responding: "End" }[voice];

  return (
    <div className="glass flex max-w-[300px] flex-col gap-2.5 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={advance}
          aria-label="next brief"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-white/8 text-[13px] font-semibold transition-colors hover:bg-white/15"
          style={{ color: vColor }}
        >
          R
        </button>
        <span className="max-h-[36px] overflow-hidden text-[12px] leading-[1.5] text-ink/65">
          {typed}
          <span className="blink ml-0.5 inline-block h-3 w-[2px] rounded-full bg-accent align-middle" />
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={startVoice}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-white/10"
          style={{ color: micOn ? "var(--color-ok)" : "rgb(235 235 245 / 0.7)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: micOn ? "var(--color-ok)" : "rgb(235 235 245 / 0.4)" }}
            aria-hidden
          />
          {micOn ? "Mic on" : "Enable mic"}
        </button>
        <button
          onClick={simCycle}
          className="whitespace-nowrap rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-medium text-ink/70 transition-colors hover:bg-white/10 hover:text-bright"
        >
          {simLabel}
        </button>
      </div>
    </div>
  );
}
