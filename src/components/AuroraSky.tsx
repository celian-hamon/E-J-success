"use client";

import { useEffect, useRef } from "react";

// Star field + drifting aurora ribbons, ported from the Aurora Glass reference page.
// Ribbons are drawn on a quarter-resolution canvas and scaled up for a soft glow.
const RIBBONS = [
  { rgb: [45, 226, 196], base: 0.36, amp: 0.075, f1: 2.1, f2: 5.3, s1: 0.11, s2: 0.07, ph: 0.3, hgt: 0.46, alpha: 0.62 },
  { rgb: [123, 92, 255], base: 0.5, amp: 0.09, f1: 1.5, f2: 4.2, s1: -0.08, s2: 0.12, ph: 2.1, hgt: 0.52, alpha: 0.58 },
  { rgb: [255, 111, 168], base: 0.64, amp: 0.06, f1: 2.7, f2: 3.4, s1: 0.065, s2: -0.09, ph: 4.2, hgt: 0.38, alpha: 0.44 },
];
const STAR_MAX = 360;
const LOWF = 4;

function ribbonSprite(rgb: number[]) {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  const col = (a: number, m = 0) =>
    "rgba(" + rgb.map((v) => Math.round(v + (255 - v) * m)).join(",") + "," + a + ")";
  g.addColorStop(0, col(0));
  g.addColorStop(0.28, col(0.04));
  g.addColorStop(0.6, col(0.2));
  g.addColorStop(0.79, col(0.5, 0.08));
  g.addColorStop(0.87, col(0.9, 0.38));
  g.addColorStop(0.915, col(0.38));
  g.addColorStop(1, col(0));
  x.fillStyle = g;
  x.fillRect(0, 0, 2, 256);
  return c;
}

function starSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(235,240,255,.85)");
  g.addColorStop(0.45, "rgba(200,210,255,.16)");
  g.addColorStop(1, "rgba(200,210,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return c;
}

export default function AuroraSky() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sky = ref.current;
    if (!sky) return;
    const sx = sky.getContext("2d");
    if (!sx) return;
    const low = document.createElement("canvas");
    const lx = low.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const star = starSprite();
    const ribbons = RIBBONS.map((r) => ({ ...r, sprite: ribbonSprite(r.rgb) }));
    const stars = Array.from({ length: STAR_MAX }, () => {
      const big = Math.random() < 0.07;
      return {
        x: Math.random(),
        y: Math.pow(Math.random(), 1.35),
        r: big ? 1.1 + Math.random() * 0.9 : 0.45 + Math.random() * 0.6,
        a: big ? 0.75 + Math.random() * 0.25 : 0.25 + Math.random() * 0.5,
        sp: 0.4 + Math.random() * 1.6,
        ph: Math.random() * 6.283,
      };
    });

    let W = 0, H = 0, DPR = 1, LW = 0, LH = 0;
    let bg: CanvasGradient, horizon: CanvasGradient;
    const ptr = { x: 0.5, y: 0.35, sx: 0.5, sy: 0.35, act: 0, tgt: 0 };

    function resize() {
      W = innerWidth;
      H = innerHeight;
      DPR = Math.min(2, devicePixelRatio || 1);
      sky!.width = Math.round(W * DPR);
      sky!.height = Math.round(H * DPR);
      LW = Math.max(40, Math.ceil(W / LOWF));
      LH = Math.max(40, Math.ceil(H / LOWF));
      low.width = LW;
      low.height = LH;
      bg = sx!.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#050817");
      bg.addColorStop(0.55, "#070b1f");
      bg.addColorStop(1, "#0c1030");
      horizon = sx!.createRadialGradient(W * 0.5, H * 1.15, 0, W * 0.5, H * 1.15, Math.max(W, H) * 0.8);
      horizon.addColorStop(0, "rgba(123,92,255,.16)");
      horizon.addColorStop(0.5, "rgba(45,226,196,.04)");
      horizon.addColorStop(1, "rgba(7,11,31,0)");
    }

    function draw(t: number) {
      ptr.sx += (ptr.x - ptr.sx) * 0.05;
      ptr.sy += (ptr.y - ptr.sy) * 0.05;
      ptr.act += (ptr.tgt - ptr.act) * 0.03;

      lx.globalCompositeOperation = "source-over";
      lx.globalAlpha = 1;
      lx.clearRect(0, 0, LW, LH);
      lx.globalCompositeOperation = "lighter";
      const scrollLift = -Math.min(1, (scrollY || 0) / (H * 2.5)) * LH * 0.16;
      const pyl = ptr.sy * LH;
      for (const R of ribbons) {
        const cx = 0.5 + 0.34 * Math.sin(t * 0.021 + R.ph);
        for (let x = 0; x < LW; x++) {
          const u = x / LW;
          let y =
            (R.base +
              R.amp * Math.sin(u * R.f1 * Math.PI + t * R.s1 + R.ph) +
              R.amp * 0.55 * Math.sin(u * R.f2 * Math.PI - t * R.s2 + R.ph * 1.7) +
              0.016 * Math.sin(u * 17 + t * 0.42 + R.ph)) * LH + scrollLift;
          const dx = (u - ptr.sx) / 0.17;
          const inf = Math.exp(-dx * dx) * ptr.act;
          y += (pyl - y) * 0.3 * inf;
          const h = R.hgt * LH * (0.85 + 0.25 * Math.sin(u * 3.3 + t * 0.13 + R.ph)) * (1 + 0.18 * inf);
          const ray = 0.5 + 0.5 * Math.sin(u * 41 + t * 0.8 + R.ph + 1.6 * Math.sin(u * 8.5 - t * 0.27));
          const d = (u - cx) / 0.55;
          const env = 0.28 + 0.72 * Math.exp(-d * d);
          lx.globalAlpha = Math.min(1, R.alpha * env * (0.42 + 0.58 * ray * ray) * (1 + 0.35 * inf));
          lx.drawImage(R.sprite, 0, 0, 2, 256, x, y - h * 0.87, 1, h);
        }
      }

      sx!.setTransform(DPR, 0, 0, DPR, 0, 0);
      sx!.globalCompositeOperation = "source-over";
      sx!.globalAlpha = 1;
      sx!.fillStyle = bg;
      sx!.fillRect(0, 0, W, H);
      sx!.fillStyle = horizon;
      sx!.fillRect(0, 0, W, H);

      const n = Math.min(STAR_MAX, Math.round((W * H) / 3600));
      for (let i = 0; i < n; i++) {
        const s = stars[i];
        const tw = reduced ? 0.85 : 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
        sx!.globalAlpha = s.a * tw * (1 - s.y * 0.55);
        const r = s.r * 3;
        sx!.drawImage(star, s.x * W - r, s.y * H - r, r * 2, r * 2);
      }

      sx!.globalCompositeOperation = "lighter";
      sx!.imageSmoothingEnabled = true;
      sx!.imageSmoothingQuality = "high";
      sx!.globalAlpha = 1;
      sx!.drawImage(low, 0, 0, LW, LH, 0, 0, W, H);
      sx!.globalAlpha = 0.33;
      sx!.drawImage(low, 0, 0, LW, LH, -W * 0.04, -H * 0.07, W * 1.08, H * 1.12);
      sx!.globalAlpha = 1;
      sx!.globalCompositeOperation = "source-over";
    }

    const onMove = (e: PointerEvent) => {
      ptr.x = e.clientX / W;
      ptr.y = e.clientY / H;
      ptr.tgt = 1;
    };
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) ptr.tgt = 0;
    };

    resize();
    addEventListener("resize", resize);
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      draw((now - start) / 1000);
      if (!reduced) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  return <canvas id="sky" ref={ref} aria-hidden="true" />;
}
