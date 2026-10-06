import { useCallback, useMemo, useRef } from "react";
import {
  beginFrame,
  useSceneAnimated,
  useSceneCanvas,
  useSceneFrame,
  useStageGeometry,
  type SceneCanvas,
} from "./runtime";
import { clamp, ok, rng, TAU } from "./scene-utils";

/** A soft, out-of-focus city seen through the window: two rows of buildings, lit windows, street bokeh. */
function City() {
  const markup = useMemo(() => {
    const r = rng(91);
    const row = (
      l0: number,
      l1: number,
      h0: number,
      h1: number,
      lit: number,
    ) => {
      let blocks = "";
      let windows = "";
      for (let x = -10; x < 1610; ) {
        const bw = 40 + r() * 70;
        const bh = h0 + r() * (h1 - h0);
        const y = 600 - bh;
        blocks += `<rect x="${x | 0}" y="${y | 0}" width="${bw | 0}" height="${bh | 0}" fill="${ok(l0 + r() * (l1 - l0), 0.014, 250)}"/>`;
        for (let wy = y + 10; wy < 585; wy += 16)
          for (let wx = x + 6; wx < x + bw - 8; wx += 12)
            if (r() < lit)
              windows += `<rect x="${wx | 0}" y="${wy | 0}" width="6" height="8" fill="${ok(0.94, 0.07, 85, 0.7)}"/>`;
        x += bw + 2 + r() * 8;
      }
      return blocks + windows;
    };
    const far = row(0.74, 0.8, 200, 380, 0.05);
    const near = row(0.56, 0.66, 110, 280, 0.16);
    const colours = [
      ok(0.93, 0.1, 80, 0.5),
      ok(0.7, 0.18, 25, 0.5),
      ok(0.98, 0.01, 250, 0.55),
      ok(0.8, 0.14, 150, 0.4),
    ];
    let bokeh = "";
    for (let i = 0; i < 42; i++)
      bokeh += `<circle cx="${(r() * 1600) | 0}" cy="${(470 + r() * 130) | 0}" r="${(5 + r() * 14).toFixed(0)}" fill="${colours[i % 4]}"/>`;
    return `<defs>
        <linearGradient id="rain-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ok(0.88, 0.008, 250)}"/><stop offset="1" stop-color="${ok(0.8, 0.014, 250)}"/></linearGradient>
        <filter id="rain-blur-far" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="rain-blur-near" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <rect x="-400" width="2400" height="600" fill="url(#rain-sky)"/>
      <g filter="url(#rain-blur-far)" opacity=".9">${far}</g>
      <g filter="url(#rain-blur-near)">${near}</g>
      <g filter="url(#rain-blur-near)">${bokeh}</g>`;
  }, []);

  return (
    <svg
      className="scene-fill"
      viewBox="0 0 1600 600"
      preserveAspectRatio="xMidYMax slice"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

type Lane = {
  x: number;
  speed: number;
  phase: number;
  radius: number;
  index: number;
};
/** A bead of water that keeps forming somewhere new, resting a while, then drying up. */
type Bead = { slot: number; period: number; phase: number; r: number };

const smooth = (v: number) => v * v * (3 - 2 * v);

function drawDrop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rad: number,
  alpha = 1,
) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(50,60,80,0.32)";
  ctx.lineWidth = Math.max(0.6, rad * 0.28);
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.85, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = Math.max(0.5, rad * 0.22);
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.8, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x - rad * 0.35, y - rad * 0.38, rad * 0.24, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function layer({ width, height, ratio }: SceneCanvas) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width * ratio));
  element.height = Math.max(1, Math.round(height * ratio));
  const ctx = element.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { element, ctx };
}

/** How long a cleared trail takes to mist over again, in drop-lengths. */
const HEAL = 4;

/** Rain on Glass: mist on a window over a soft city; drops bead and run down the margins, clear of the text. */
export default function RainScene() {
  const geometry = useStageGeometry();
  const animated = useSceneAnimated();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas = useSceneCanvas(
    canvasRef,
    geometry.width,
    geometry.height,
    1.5,
  );
  const { width, height } = geometry;
  const stageLeft = geometry.stage?.left ?? 0;
  const stageRight = geometry.stage?.right ?? width;
  const columnLeft = geometry.column?.left ?? width / 2 - 330;
  const columnRight = geometry.column?.right ?? width / 2 + 330;

  const scene = useMemo(() => {
    if (!canvas) return null;
    const r = rng(93);
    const scale = clamp(height / 600, 1, 1.6);
    const margins = [
      [stageLeft + 16, columnLeft - 16],
      [columnRight + 16, stageRight - 16],
    ].filter(([a, b]) => b - a >= 28);

    // Mist on the glass, thickest behind the story column, with a fine grain of tiny droplets.
    const mist = layer(canvas);
    const fogStart = columnLeft - 200;
    const fogEnd = columnRight + 200;
    const fog = mist.ctx.createLinearGradient(fogStart, 0, fogEnd, 0);
    const stop = (x: number) =>
      clamp((x - fogStart) / (fogEnd - fogStart), 0, 1);
    fog.addColorStop(0, "rgba(232,237,243,0.4)");
    fog.addColorStop(stop(columnLeft), "rgba(238,241,246,0.72)");
    fog.addColorStop(stop(columnRight), "rgba(238,241,246,0.72)");
    fog.addColorStop(1, "rgba(232,237,243,0.4)");
    mist.ctx.fillStyle = fog;
    mist.ctx.fillRect(0, 0, width, height);
    const grain = document.createElement("canvas");
    grain.width = 480;
    grain.height = 300;
    const g = grain.getContext("2d")!;
    for (let i = 0; i < 2600; i++) {
      const x = r() * 480;
      const y = r() * 300;
      const rad = 0.25 + Math.pow(r(), 2) * 0.9;
      g.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.35).toFixed(2)})`;
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.fill();
      if (rad > 0.6) {
        g.fillStyle = "rgba(90,100,120,0.22)";
        g.beginPath();
        g.arc(x + rad * 0.3, y + rad * 0.3, rad * 0.6, 0, TAU);
        g.fill();
      }
    }
    const pattern = mist.ctx.createPattern(grain, "repeat");
    if (pattern) {
      mist.ctx.save();
      mist.ctx.scale(2, 2);
      mist.ctx.globalAlpha = 0.85;
      mist.ctx.fillStyle = pattern;
      mist.ctx.fillRect(0, 0, width / 2, height / 2);
      mist.ctx.restore();
    }

    // Drops bead on the glass in the margins, each on its own slow cycle.
    const marginWidth = margins.reduce((sum, [a, b]) => sum + (b - a), 0);
    const beadCount = Math.min(240, Math.round(marginWidth * height * 4.3e-4));
    const beads: Bead[] = Array.from({ length: beadCount }, (_, slot) => ({
      slot,
      period: 18 + r() * 27,
      phase: r(),
      r: (1 + Math.pow(r(), 3) * 4.5) * scale,
    }));

    // Lanes where drops run down, a few per margin.
    const lanes: Lane[] = [];
    for (const [a, b] of margins) {
      const count = clamp(Math.floor((b - a) / 44), 1, 4);
      for (let i = 0; i < count; i++)
        lanes.push({
          x: a + ((b - a) * (i + 0.5)) / count + (r() - 0.5) * 10,
          speed: 0.06 + r() * 0.05,
          phase: r(),
          radius: (2.4 + r() * 1.6) * scale,
          index: lanes.length,
        });
    }

    const rain = Array.from({ length: Math.round((70 * width) / 960) }, () => ({
      x: r() * (width + 140),
      y: r() * height,
      v: 380 + r() * 200,
      a: (0.06 + r() * 0.08).toFixed(2),
    }));
    return {
      mist: mist.element,
      beads,
      margins,
      marginWidth,
      lanes,
      rain,
      scale,
    };
  }, [canvas, width, height, stageLeft, stageRight, columnLeft, columnRight]);

  const draw = useCallback(
    (t: number) => {
      if (!canvas || !scene) return;
      beginFrame(canvas);
      const { ctx } = canvas;
      const { scale } = scene;

      // Rain falling outside, softened by the mist on the glass.
      ctx.lineWidth = 1;
      const fall = height + 40;
      const span = width + 140;
      for (const d of scene.rain) {
        const y = ((((d.y + t * d.v) % fall) + fall) % fall) - 20;
        const x = ((((d.x - y * 0.12) % span) + span) % span) - 70;
        ctx.strokeStyle = `rgba(90,100,120,${d.a})`;
        ctx.beginPath();
        ctx.moveTo(x + 2.4, y - 20);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.drawImage(scene.mist, 0, 0, width, height);

      // Running drops wipe trails through the mist, which closes back over them with age.
      const Y = (f: number) =>
        -40 * scale +
        (height + 100 * scale) * (f - 0.012 * Math.sin(f * TAU * 9));
      const laneX = (lane: Lane, cycle: number) =>
        lane.x + (rng(cycle * 31 + lane.index * 7)() - 0.5) * 16;
      const wobble = (x: number, y: number, i: number) =>
        x + 2 * Math.sin(y * 0.045 + i);
      const trailBeads: [number, number, number, number][] = [];
      const heads: [number, number, number][] = [];
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const lane of scene.lanes) {
        const u = t * lane.speed + lane.phase;
        const cycle = Math.floor(u);
        for (const cc of [cycle - 1, cycle]) {
          const fmax = Math.min(1, u - cc);
          if (fmax <= 0) continue;
          const x = laneX(lane, cc);
          const y0 = Y(0);
          const y1 = Y(fmax);
          const length = Math.max(1, y1 - y0);
          // One stroke per trail, its clearing fading with age from the head upward.
          const gradient = ctx.createLinearGradient(0, y0, 0, y0 + length);
          for (let k = 0; k <= 8; k++) {
            const f = (fmax * k) / 8;
            const age = (u - cc - f) / lane.speed / HEAL;
            gradient.addColorStop(
              clamp((Y(f) - y0) / length, 0, 1),
              `rgba(0,0,0,${(0.78 * Math.exp(-age)).toFixed(3)})`,
            );
          }
          ctx.strokeStyle = gradient;
          ctx.lineWidth = lane.radius * 2;
          ctx.beginPath();
          ctx.moveTo(wobble(x, y0, lane.index), y0);
          const steps = Math.max(2, Math.ceil(length / 6));
          for (let k = 1; k <= steps; k++) {
            const y = y0 + (length * k) / steps;
            ctx.lineTo(wobble(x, y, lane.index), y);
          }
          ctx.stroke();
          const br = rng(cc * 17 + lane.index * 5);
          for (let k = 0; k < 6; k++) {
            const f = br();
            const jitter = (br() - 0.5) * 2;
            const rad = (0.7 + br() * 0.7) * scale;
            if (f > fmax) continue;
            const alpha = Math.exp(-(u - cc - f) / lane.speed / (HEAL * 1.5));
            if (alpha > 0.03)
              trailBeads.push([
                wobble(x, Y(f), lane.index) + jitter,
                Y(f),
                rad,
                alpha,
              ]);
          }
          if (cc === cycle)
            heads.push([wobble(x, y1, lane.index), y1, lane.radius]);
        }
      }
      ctx.globalCompositeOperation = "source-over";

      // Beads form, rest on the glass, then shrink away as they dry, and form again somewhere else.
      for (const bead of scene.beads) {
        const u = t / bead.period + bead.phase;
        const cycle = Math.floor(u);
        const f = u - cycle;
        const life =
          smooth(clamp(f / 0.05, 0, 1)) *
          smooth(1 - clamp((f - 0.72) / 0.18, 0, 1));
        if (life < 0.01) continue;
        const spot = rng(bead.slot * 7919 + cycle * 104729);
        let along = spot() * scene.marginWidth;
        let x = 0;
        for (const [a, b] of scene.margins) {
          if (along <= b - a) {
            x = a + along;
            break;
          }
          along -= b - a;
        }
        drawDrop(ctx, x, spot() * height, bead.r * (0.45 + 0.55 * life), life);
      }
      for (const [x, y, rad, alpha] of trailBeads)
        drawDrop(ctx, x, y, rad, alpha);
      for (const [x, y, rad] of heads) drawDrop(ctx, x, y, rad);
    },
    [canvas, scene, width, height],
  );
  useSceneFrame(draw, { animated, fps: 30 });

  return (
    <div data-theme-scene="back" aria-hidden="true">
      <City />
      <canvas ref={canvasRef} />
    </div>
  );
}
