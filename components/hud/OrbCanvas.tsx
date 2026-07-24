"use client";

import { useEffect, useRef } from "react";
import type { VoiceState } from "./voice";

/** Shared mutable channel between the voice dock and the orb: the analyser
 *  feeds amplitude into the draw loop, the smoothed mouse drives parallax
 *  on the pinned tags (updated from inside the same rAF). */
export type OrbBus = {
  analyser: AnalyserNode | null;
  /** pin elements to parallax-shift: id → { el, d(epth) } */
  tags: Record<string, { el: HTMLElement | null; d: number }>;
  /** set by the draw loop when mic goes quiet while listening */
  onSilence?: () => void;
};

export function OrbCanvas({
  bus,
  voice,
  className,
  style,
}: {
  bus: React.MutableRefObject<OrbBus>;
  voice: VoiceState;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const N = 420;
    const pts: number[][] = [];
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.cbrt(Math.random()) * (Math.random() < 0.12 ? 1.18 : 1);
      const s = Math.sqrt(1 - u * u);
      pts.push([s * Math.cos(th) * r, u * r, s * Math.sin(th) * r, Math.random()]);
    }
    const pairs: number[][] = [];
    const th2 = 0.24 * 0.24;
    for (let i = 0; i < N && pairs.length < 900; i++)
      for (let j = i + 1; j < N; j++) {
        const dx = pts[i][0] - pts[j][0];
        const dy = pts[i][1] - pts[j][1];
        const dz = pts[i][2] - pts[j][2];
        if (dx * dx + dy * dy + dz * dz < th2) pairs.push([i, j]);
      }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let mx = 0,
      my = 0,
      sx = 0,
      sy = 0;
    const onMove = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove);

    const abuf = new Uint8Array(512);
    let smAmp = 0;
    let lastLoud = 0;
    let painted = false;
    const t0 = performance.now();
    let raf = 0;

    const draw = () => {
      if (!reduced) raf = requestAnimationFrame(draw);
      // always paint the first frame so a backgrounded tab isn't blank
      if (document.hidden && painted) return;
      painted = true;
      const now = performance.now();
      const t = reduced ? 20 : (now - t0) / 1000;
      const v = voiceRef.current;

      sx += (mx - sx) * 0.05;
      sy += (my - sy) * 0.05;

      // amplitude: real mic when analysing, synthetic pulse otherwise
      let amp = 0;
      const analyser = bus.current.analyser;
      if (v === "listening" && analyser) {
        const buf = abuf.subarray(0, analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const d = (buf[i] - 128) / 128;
          sum += d * d;
        }
        amp = Math.min(1, Math.sqrt(sum / buf.length) * 6);
        if (amp > 0.14) lastLoud = now;
        if (lastLoud === 0) lastLoud = now;
        if (now - lastLoud > 2600) {
          lastLoud = 0;
          bus.current.onSilence?.();
        }
      } else if (v === "listening") {
        amp = 0.25 + Math.abs(Math.sin(t * 3.1)) * 0.35;
      } else if (v === "responding") {
        amp = 0.3 + Math.abs(Math.sin(t * 6.3)) * 0.4 * (0.6 + 0.4 * Math.sin(t * 1.7));
      } else {
        lastLoud = 0;
      }
      smAmp += (amp - smAmp) * 0.15;
      const A = smAmp;

      const lr = 160,
        lg = 120,
        lb = 250;
      const W = cv.width;
      const cx = W / 2;
      const cy = W / 2;
      ctx.clearRect(0, 0, W, W);
      const rotY = t * 0.1 + sx * 0.9;
      const rotX = 0.15 + sy * 0.55;
      const cyR = Math.cos(rotY),
        syR = Math.sin(rotY);
      const cxR = Math.cos(rotX),
        sxR = Math.sin(rotX);
      const R = W * 0.32;
      const f = 3.4;

      let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      g.addColorStop(0, `rgba(${lr - 20},${lg - 20},${lb - 15},${(0.22 + A * 0.14).toFixed(2)})`);
      g.addColorStop(0.45, `rgba(${lr - 50},${lg - 50},${lb - 50},.09)`);
      g.addColorStop(1, "rgba(110,70,200,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, W);

      const proj = pts.map((p) => {
        const wob =
          (1 + Math.sin(t * 0.7 + p[3] * 6.28) * 0.02) *
          (1 + A * 0.3 * Math.sin(t * 8 + p[3] * 40) * (0.4 + 0.6 * p[3]));
        const x = p[0] * cyR + p[2] * syR;
        const z1 = -p[0] * syR + p[2] * cyR;
        const y = p[1] * cxR - z1 * sxR;
        const z = p[1] * sxR + z1 * cxR;
        const s = f / (f - z);
        return [cx + x * R * s * wob, cy + y * R * s * wob, z, p[3]];
      });

      ctx.lineWidth = W / 1100;
      for (const [i, j] of pairs) {
        const a = proj[i],
          b = proj[j];
        const depth = ((a[2] + b[2]) / 2 + 1.2) / 2.4;
        ctx.strokeStyle = `rgba(${lr},${lg},${lb},${(0.04 + depth * 0.16 + A * 0.06).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      for (const p of proj) {
        const depth = (p[2] + 1.2) / 2.4;
        const bright = p[3] > 0.82;
        const rr = (bright ? 1.6 + depth * 2.2 : 0.7 + depth * 1.5) * (W / 1100);
        ctx.fillStyle = bright
          ? `rgba(238,232,255,${(0.35 + depth * 0.6).toFixed(2)})`
          : `rgba(${lr + 10},${lg + 15},${lb},${(0.18 + depth * 0.5 + A * 0.1).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p[0], p[1], rr, 0, 7);
        ctx.fill();
      }
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.4);
      g.addColorStop(0, `rgba(240,235,255,${(0.3 + A * 0.3).toFixed(2)})`);
      g.addColorStop(1, "rgba(240,235,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.4, 0, 7);
      ctx.fill();

      // parallax: orb drifts against the cursor, pinned tags drift with it
      if (!reduced) {
        cv.style.transform = `translate(-50%,-50%) translate(${(-sx * 14).toFixed(1)}px,${(-sy * 14).toFixed(1)}px)`;
        for (const id in bus.current.tags) {
          const c = bus.current.tags[id];
          if (!c?.el) continue;
          c.el.style.transform = `translate(-50%,-50%) translate(${(sx * 18 * c.d).toFixed(1)}px,${(sy * 18 * c.d).toFixed(1)}px)`;
        }
      }
    };

    draw();
    const onVis = () => {
      if (!document.hidden && reduced) draw();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [bus]);

  /* the wrapper takes layout position (responsive classes from the parent);
     the canvas is centered inside it and only ever moved by the draw loop */
  return (
    <div className={className} style={style} aria-hidden>
      <canvas
        ref={ref}
        width={1100}
        height={1100}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "100%",
          height: "100%",
          transform: "translate(-50%,-50%)",
        }}
      />
    </div>
  );
}
