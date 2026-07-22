"use client";

import { useEffect, useRef } from "react";

/**
 * Volumetric point-cloud orb from the reference design, trimmed down:
 * fewer points, pauses when the tab is hidden, static when the user
 * prefers reduced motion. Purely decorative.
 */
export function Orb() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const N = 220;
    const pts: number[][] = [];
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.cbrt(Math.random()) * (Math.random() < 0.12 ? 1.18 : 1);
      const s = Math.sqrt(1 - u * u);
      pts.push([s * Math.cos(th) * r, u * r, s * Math.sin(th) * r, Math.random()]);
    }
    const pairs: number[][] = [];
    const th2 = 0.3 * 0.3;
    for (let i = 0; i < N && pairs.length < 420; i++)
      for (let j = i + 1; j < N; j++) {
        const dx = pts[i][0] - pts[j][0];
        const dy = pts[i][1] - pts[j][1];
        const dz = pts[i][2] - pts[j][2];
        if (dx * dx + dy * dy + dz * dz < th2) pairs.push([i, j]);
      }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;

    const draw = () => {
      if (!reduced) raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const t = reduced ? 20 : (performance.now() - t0) / 1000;
      const W = cv.width;
      const cx = W / 2;
      const cy = W / 2;
      ctx.clearRect(0, 0, W, W);
      const rotY = t * 0.1;
      const rotX = 0.18;
      const cyR = Math.cos(rotY), syR = Math.sin(rotY);
      const cxR = Math.cos(rotX), sxR = Math.sin(rotX);
      const R = W * 0.32;
      const f = 3.4;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      g.addColorStop(0, "rgba(140,100,230,.20)");
      g.addColorStop(0.45, "rgba(110,70,200,.08)");
      g.addColorStop(1, "rgba(110,70,200,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, W);
      const proj = pts.map((p) => {
        const wob = 1 + Math.sin(t * 0.7 + p[3] * 6.28) * 0.02;
        const x = p[0] * cyR + p[2] * syR;
        const z1 = -p[0] * syR + p[2] * cyR;
        const y = p[1] * cxR - z1 * sxR;
        const z = p[1] * sxR + z1 * cxR;
        const s = f / (f - z);
        return [cx + x * R * s * wob, cy + y * R * s * wob, z, p[3]];
      });
      ctx.lineWidth = W / 1100;
      for (const [i, j] of pairs) {
        const a = proj[i], b = proj[j];
        const depth = ((a[2] + b[2]) / 2 + 1.2) / 2.4;
        ctx.strokeStyle = `rgba(160,120,250,${(0.04 + depth * 0.14).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      for (const p of proj) {
        const depth = (p[2] + 1.2) / 2.4;
        const bright = p[3] > 0.82;
        const rr = (bright ? 1.4 + depth * 2 : 0.6 + depth * 1.4) * (W / 1100);
        ctx.fillStyle = bright
          ? `rgba(238,232,255,${(0.3 + depth * 0.55).toFixed(2)})`
          : `rgba(170,135,250,${(0.15 + depth * 0.45).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p[0], p[1], rr, 0, 7);
        ctx.fill();
      }
    };

    draw();
    const onVis = () => {
      if (!document.hidden && reduced) draw();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={700}
      height={700}
      aria-hidden
      className="pointer-events-none fixed right-[-120px] top-[12%] -z-0 hidden opacity-60 lg:block"
      style={{ width: "min(560px, 70vh)", height: "min(560px, 70vh)" }}
    />
  );
}
