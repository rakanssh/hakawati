import { useCallback, useMemo, useRef } from "react";
import {
  beginFrame,
  useSceneAnimated,
  useSceneCanvas,
  useSceneFrame,
  useStageGeometry,
  type StageGeometry,
} from "./runtime";
import { clamp, f1, ok, rng, sparklePath, TAU } from "./scene-utils";

type Star = {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
};

/** Still stars over the whole sky, thinned out behind the reading column; bright sparkles only in the margins. */
function makeSky({ width, height, column }: StageGeometry) {
  const r = rng(77);
  const left = column ? column.left : width / 2 - 330;
  const right = column ? column.right : width / 2 + 330;
  const inColumn = (x: number, pad: number) =>
    x > left - pad && x < right + pad;

  const stars: Star[] = [];
  const starCount = Math.min(520, Math.round(width * height * 1.9e-4));
  for (
    let guard = 0;
    stars.length < starCount && guard < starCount * 6;
    guard++
  ) {
    const x = r() * width;
    const y = r() * height;
    if (inColumn(x, 10) && r() > 0.22) continue;
    const q = r();
    stars.push({
      x,
      y,
      size: q < 0.7 ? 0.8 : q < 0.92 ? 1.2 : 1.7,
      phase: r() * TAU,
      speed: 0.15 + r() * 0.35,
    });
  }

  const sparkles: Star[] = [];
  const sparkleCount = clamp(Math.round((8 * width) / 960), 6, 14);
  for (let guard = 0; sparkles.length < sparkleCount && guard < 400; guard++) {
    const x = 20 + r() * (width - 40);
    const y = 40 + r() * (height * 0.7);
    if (inColumn(x, 30)) continue;
    sparkles.push({
      x,
      y,
      size: 4 + r() * 4,
      phase: r() * TAU,
      speed: 0.2 + r() * 0.3,
    });
  }
  return { stars, sparkles };
}

/** Orbit: a flat night sky with a stylised red planet turning slowly in the bottom corner. */
export default function OrbitScene() {
  const geometry = useStageGeometry();
  const animated = useSceneAnimated();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas = useSceneCanvas(canvasRef, geometry.width, geometry.height);
  const { width, height, column } = geometry;
  const sky = useMemo(
    () => makeSky({ width, height, column, stage: null, composer: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height, column?.left, column?.right],
  );

  const draw = useCallback(
    (t: number) => {
      if (!canvas) return;
      beginFrame(canvas);
      const { ctx } = canvas;
      // Flat, still stars that twinkle gently.
      for (const s of sky.stars) {
        ctx.fillStyle = `rgba(236,238,255,${(0.72 + 0.28 * Math.sin(t * s.speed + s.phase)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(244,244,255,0.95)";
      for (const s of sky.sparkles) {
        const k = 0.85 + 0.15 * Math.sin(t * s.speed + s.phase);
        ctx.fill(new Path2D(sparklePath(s.x, s.y, s.size * k)));
      }
    },
    [canvas, sky],
  );
  useSceneFrame(draw, { animated, fps: 20 });

  const scale = clamp(Math.min(width / 960, height / 600), 0.7, 1.6);

  return (
    <div data-theme-scene="back" aria-hidden="true">
      <div className="orbit-sky scene-fill" />
      <canvas ref={canvasRef} />
      <Planet scale={scale} />
    </div>
  );
}

// The planet is drawn in a 960×600 frame anchored to the window's bottom-right corner.
const CX = 1040;
const CY = 615;
const R = 210;
const WAVELENGTH = 160;
const HALO = R + 50;

/** A wavy band across the disc; it repeats every wavelength, so drifting it by one loops cleanly. */
function bandPath(
  y1: number,
  y2: number,
  a1: number,
  a2: number,
  p1: number,
  p2: number,
) {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let x = CX - R - WAVELENGTH; x <= CX + R + 12; x += 6) {
    const k = (x / WAVELENGTH) * TAU;
    top.push(`${x} ${f1(CY + y1 + a1 * Math.sin(k + p1))}`);
    bottom.push(`${x} ${f1(CY + y2 + a2 * Math.sin(k + p2))}`);
  }
  return `M${top.join("L")}L${bottom.reverse().join("L")}Z`;
}

const ring = (x: number, y: number) =>
  `M${x - R} ${y}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z`;

const BANDS = [
  { d: bandPath(-R - 30, -0.8 * R, 0, 4, 0, 0.6), fill: ok(0.9, 0.035, 80) },
  {
    d: bandPath(-0.56 * R, -0.36 * R, 4, 5, 1.1, 2.3),
    fill: ok(0.79, 0.11, 58),
  },
  {
    d: bandPath(-0.12 * R, 0.16 * R, 5, 4, 2.6, 0.4),
    fill: ok(0.56, 0.17, 32),
  },
];

const WISPS = (() => {
  let d = "";
  for (let x0 = CX - R - WAVELENGTH; x0 <= CX + R + 12; x0 += WAVELENGTH) {
    d += `M${x0 + 12} ${f1(CY - 0.69 * R)}h30M${x0 + 84} ${f1(CY - 0.3 * R)}h40M${x0 + 30} ${f1(CY - 0.22 * R)}h22M${x0 + 120} ${f1(CY - 0.74 * R)}h18`;
  }
  return d;
})();

const STORM_X = CX - R - 40;
const STORM_Y = CY - 0.28 * R;
const HALO_EDGE = R / HALO;

function Planet({ scale }: { scale: number }) {
  return (
    <svg
      className="orbit-planet"
      viewBox="700 330 260 270"
      style={{ width: 260 * scale, height: 270 * scale }}
    >
      <defs>
        <clipPath id="orbit-planet-clip">
          <circle cx={CX} cy={CY} r={R} />
        </clipPath>
        {/* Atmosphere: warm at the limb, fading out through violet. */}
        <radialGradient
          id="orbit-planet-halo"
          cx={CX}
          cy={CY}
          r={HALO}
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset={HALO_EDGE - 0.01}
            stopColor={ok(0.86, 0.11, 60)}
            stopOpacity={0}
          />
          <stop
            offset={HALO_EDGE}
            stopColor={ok(0.88, 0.1, 62)}
            stopOpacity={0.8}
          />
          <stop
            offset={HALO_EDGE + 0.04}
            stopColor={ok(0.74, 0.13, 45)}
            stopOpacity={0.32}
          />
          <stop
            offset={HALO_EDGE + 0.11}
            stopColor={ok(0.52, 0.11, 300)}
            stopOpacity={0.12}
          />
          <stop offset={1} stopColor={ok(0.52, 0.11, 300)} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g className="orbit-float">
        <circle
          className="orbit-halo"
          cx={CX}
          cy={CY}
          r={HALO}
          fill="url(#orbit-planet-halo)"
        />
        <g clipPath="url(#orbit-planet-clip)">
          <circle cx={CX} cy={CY} r={R} fill={ok(0.67, 0.16, 42)} />
          <g transform={`rotate(-18 ${CX} ${CY})`}>
            <g className="orbit-drift">
              {BANDS.slice(0, 2).map((band) => (
                <path key={band.d} d={band.d} fill={band.fill} />
              ))}
            </g>
            <g className="orbit-drift-b">
              <path d={BANDS[2].d} fill={BANDS[2].fill} />
            </g>
            <g className="orbit-spot">
              <ellipse
                cx={STORM_X}
                cy={STORM_Y}
                rx={19}
                ry={9}
                fill={ok(0.52, 0.16, 32)}
              />
              <ellipse
                cx={STORM_X + 2}
                cy={STORM_Y - 1}
                rx={10}
                ry={4.5}
                fill={ok(0.76, 0.12, 50)}
              />
            </g>
            <g className="orbit-wisp">
              <path
                d={WISPS}
                fill="none"
                stroke={ok(0.95, 0.04, 75, 0.5)}
                strokeWidth={3.2}
                strokeLinecap="round"
              />
            </g>
          </g>
          {/* Rim light: a bright crescent along the sunlit edge. */}
          <path
            d={ring(CX, CY) + ring(CX + 11, CY + 10)}
            fillRule="evenodd"
            fill={ok(0.95, 0.06, 75, 0.5)}
          />
        </g>
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={ok(0.96, 0.05, 72, 0.7)}
          strokeWidth={2}
        />
      </g>
    </svg>
  );
}
