import { useCallback, useMemo, useRef } from "react";
import { useSceneAnimated, useSceneFrame, useStageGeometry } from "./runtime";
import { clamp, f1, ok, rng, starPath, TAU } from "./scene-utils";

// The doodles are drawn in a 960×600 frame; each corner's group is pinned to that corner of the window.
const INK = ok(0.38, 0.08, 262, 0.7);
const CORAL = ok(0.66, 0.15, 30);
const SUN = ok(0.8, 0.15, 75);
const GREEN = ok(0.62, 0.12, 145);

const SUN_RAYS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * TAU;
  return `M${f1(80 + Math.cos(a) * 26)} ${f1(96 + Math.sin(a) * 26)}L${f1(80 + Math.cos(a) * 36)} ${f1(96 + Math.sin(a) * 36)}`;
}).join("");

// Two little figures under the tree play catch: they hold the ball, wind up, toss it, and wait a while.
const FIGURES = [
  { x: 856, dir: 1 },
  { x: 938, dir: -1 },
];
const FLIGHT = 1.7;
const TURNS = (() => {
  const r = rng(808);
  return Array.from({ length: 6 }, () => 1.5 + r() * 2.8);
})();
const PERIOD = TURNS.reduce((sum, hold) => sum + hold + FLIGHT, 0);

type Point = [number, number];
const ease = (v: number) => v * v * (3 - 2 * v);
const mix = (a: Point, b: Point, k: number): Point => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
];
const grip = (f: (typeof FIGURES)[number]): Point => [f.x + f.dir * 5, 500.5];
const idle = (f: (typeof FIGURES)[number]): Point => [f.x, 505.5];
const reach = (f: (typeof FIGURES)[number]): Point => [f.x + f.dir * 7, 496.5];

/** Where the ball and each figure's hands are at time t, and how high each figure hops. */
function playCatch(t: number) {
  let local = ((t % PERIOD) + PERIOD) % PERIOD;
  let turn = 0;
  while (local >= TURNS[turn] + FLIGHT) {
    local -= TURNS[turn] + FLIGHT;
    turn++;
  }
  const hold = TURNS[turn];
  const holder = turn % 2;
  const other = 1 - holder;
  const hands: Point[] = [idle(FIGURES[0]), idle(FIGURES[1])];
  const hops = [0, 0];
  let ball: Point;
  if (local < hold) {
    const wind = clamp((local - (hold - 0.45)) / 0.45, 0, 1);
    const back = Math.sin(Math.PI * wind);
    const g = grip(FIGURES[holder]);
    ball = [g[0] - FIGURES[holder].dir * 2.5 * back, g[1] - 3.5 * back];
    hands[holder] = ball;
    hops[holder] = -2.4 * Math.sin(Math.PI * clamp(local / 0.32, 0, 1));
  } else {
    const k = (local - hold) / FLIGHT;
    const from = grip(FIGURES[holder]);
    const to = grip(FIGURES[other]);
    ball = [
      from[0] + (to[0] - from[0]) * k,
      from[1] + (to[1] - from[1]) * k - 120 * k * (1 - k),
    ];
    hands[holder] =
      k < 0.25
        ? reach(FIGURES[holder])
        : mix(
            reach(FIGURES[holder]),
            idle(FIGURES[holder]),
            ease(clamp((k - 0.25) / 0.35, 0, 1)),
          );
    hands[other] =
      k > 0.86
        ? ball
        : mix(
            idle(FIGURES[other]),
            reach(FIGURES[other]),
            ease(clamp((k - 0.45) / 0.4, 0, 1)),
          );
  }
  return { ball, hands, hops };
}

/** An arm from the shoulder towards the hand target, no longer than a little arm can reach. */
function armPath(fx: number, side: number, hand: Point, hop: number) {
  const sx = fx + side * 3.5;
  const sy = 504;
  // Hands spread out to the sides at rest and come together on the ball.
  const rest = Math.hypot(hand[0] - fx, hand[1] - 505.5);
  const spread = 2 + 4 * clamp(1 - rest / 6, 0, 1);
  let hx = hand[0] + side * spread;
  let hy = hand[1] - hop + 0.6;
  const dx = hx - sx;
  const dy = hy - sy;
  const length = Math.hypot(dx, dy);
  if (length > 7.5) {
    hx = sx + (dx / length) * 7.5;
    hy = sy + (dy / length) * 7.5;
  }
  return `M${sx} ${sy}L${hx.toFixed(1)} ${hy.toFixed(1)}`;
}

/** Storybook: watercolour washes in the corners, crayon doodles, a paper plane and a game of catch. */
export default function StorybookScene() {
  const { width, height, stage, column } = useStageGeometry();
  const animated = useSceneAnimated();
  const routeRef = useRef<SVGPathElement>(null);
  const planeRef = useRef<SVGGElement>(null);
  const ballRef = useRef<SVGCircleElement>(null);
  const figureRefs = useRef<(SVGGElement | null)[]>([]);
  const armRefs = useRef<(SVGPathElement | null)[]>([]);

  const scale = clamp(Math.min(width / 960, height / 600), 0.75, 1.5);
  const left = stage?.left ?? 0;
  // Pinned to the story area, so an open story panel never covers the right-hand doodles.
  const right = stage?.right ?? width;
  const bottom = height;
  const centerX = column
    ? (column.left + column.right) / 2
    : (left + right) / 2;
  const reach = Math.hypot((right - left) / 2, height / 2);
  // Doodles only appear where there is margin for them, so nothing busy sits behind the text.
  const roomLeft = column ? column.left - left : 0;
  const roomRight = column ? right - column.right : 0;
  const showLeft = roomLeft > 110 * scale;
  const showRight = roomRight > 110 * scale;

  // The plane's dotted route loops up out of the left margin, skims the top of the window above the
  // story, and drops back down the right margin.
  const route = useMemo(() => {
    const span = right - left;
    const P = (x: number, y: number) => `${f1(left + x * span)} ${f1(y)}`;
    const low = 150 * scale;
    return `M${P(0.03, low)}C${P(0.12, 30)} ${P(0.24, 70)} ${P(0.36, 46)}S${P(0.62, 36)} ${P(0.8, 50)}S${P(0.96, low + 40)} ${P(1, low - 20)}`;
  }, [left, right, scale]);

  const draw = useCallback(
    (t: number) => {
      const path = routeRef.current;
      const plane = planeRef.current;
      if (path && plane) {
        const length = path.getTotalLength();
        const d = ((t * 0.055) % 1) * length;
        const p = path.getPointAtLength(d);
        const q = path.getPointAtLength(Math.min(length, d + 2));
        const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
        plane.setAttribute(
          "transform",
          `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${scale})`,
        );
      }
      const { ball, hands, hops } = playCatch(t);
      ballRef.current?.setAttribute(
        "transform",
        `translate(${ball[0].toFixed(1)} ${ball[1].toFixed(1)})`,
      );
      FIGURES.forEach((figure, i) => {
        figureRefs.current[i]?.setAttribute(
          "transform",
          `translate(0 ${hops[i].toFixed(2)})`,
        );
        [-1, 1].forEach((side, j) => {
          armRefs.current[i * 2 + j]?.setAttribute(
            "d",
            armPath(figure.x, side, hands[i], hops[i]),
          );
        });
      });
    },
    [scale],
  );
  useSceneFrame(draw, { animated, fps: 30 });

  const corner = (x: number, y: number) =>
    `translate(${f1(x)} ${f1(y)}) scale(${scale})`;
  const topLeft = corner(left, 0);
  const topRight = corner(right - 960 * scale, 0);
  const bottomLeft = corner(left, bottom - 600 * scale);
  const bottomRight = corner(right - 960 * scale, bottom - 600 * scale);

  return (
    <>
      <div data-theme-scene="back" aria-hidden="true">
        <svg className="scene-fill" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <filter
              id="storybook-wobble"
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.035"
                numOctaves={2}
                seed={3}
                result="noise"
              />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={4} />
            </filter>
            <filter
              id="storybook-water"
              x="-40%"
              y="-40%"
              width="180%"
              height="180%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.011"
                numOctaves={3}
                seed={8}
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={80}
                result="washed"
              />
              <feGaussianBlur in="washed" stdDeviation={3} />
            </filter>
            {/* Keep the washes away from the reading column. */}
            <radialGradient
              id="storybook-clear"
              cx={centerX}
              cy={height / 2}
              r={reach}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#000" />
              <stop offset="0.42" stopColor="#000" />
              <stop offset="0.78" stopColor="#fff" />
            </radialGradient>
            <mask id="storybook-edges">
              <rect
                width={width}
                height={height}
                fill="url(#storybook-clear)"
              />
            </mask>
          </defs>

          <g mask="url(#storybook-edges)">
            <g
              filter="url(#storybook-water)"
              style={{ mixBlendMode: "multiply" }}
            >
              <circle
                transform={topLeft}
                cx={40}
                cy={70}
                r={150}
                fill={ok(0.86, 0.09, 25, 0.55)}
              />
              <circle
                transform={topRight}
                cx={930}
                cy={60}
                r={140}
                fill={ok(0.86, 0.08, 215, 0.5)}
              />
              <circle
                transform={bottomRight}
                cx={935}
                cy={560}
                r={170}
                fill={ok(0.9, 0.1, 100, 0.5)}
              />
              <circle
                transform={bottomLeft}
                cx={30}
                cy={560}
                r={150}
                fill={ok(0.85, 0.08, 300, 0.45)}
              />
              <circle
                transform={corner(left, height / 2 - 300 * scale)}
                cx={150}
                cy={330}
                r={90}
                fill={ok(0.88, 0.08, 160, 0.35)}
              />
              <circle
                transform={corner(
                  right - 960 * scale,
                  height / 2 - 300 * scale,
                )}
                cx={830}
                cy={300}
                r={90}
                fill={ok(0.88, 0.07, 60, 0.35)}
              />
            </g>
          </g>

          {/* Each doodle wobbles on its own, so animating one never re-filters the whole window. */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Sun, top left. */}
            <g
              transform={topLeft}
              filter="url(#storybook-wobble)"
              visibility={showLeft ? undefined : "hidden"}
            >
              <path d={SUN_RAYS} stroke={SUN} strokeWidth={2.6} />
              <circle
                cx={80}
                cy={96}
                r={18}
                stroke={SUN}
                strokeWidth={2.6}
                fill={ok(0.92, 0.12, 90, 0.5)}
              />
            </g>
            {/* Moon and stars, top right. */}
            <g
              transform={topRight}
              filter="url(#storybook-wobble)"
              visibility={showRight ? undefined : "hidden"}
            >
              <path
                d="M872 70a24 24 0 1 0 24 32a18 18 0 1 1 -24 -32z"
                stroke={INK}
                strokeWidth={2.2}
                fill={ok(0.95, 0.06, 95, 0.6)}
              />
              <path
                d={starPath(918, 64, 7, 0.45, 5)}
                stroke={SUN}
                strokeWidth={1.8}
                fill={ok(0.92, 0.12, 90, 0.6)}
              />
              <path
                d={starPath(850, 122, 5, 0.45, 5)}
                stroke={SUN}
                strokeWidth={1.6}
              />
            </g>
            {/* A cottage with smoke from the chimney, bottom left. */}
            <g
              transform={bottomLeft}
              filter="url(#storybook-wobble)"
              visibility={showLeft ? undefined : "hidden"}
            >
              <path
                d="M40 470l30-24l30 24v34h-60zM62 504v-18h14v18M50 466v-18h9v11"
                stroke={INK}
                strokeWidth={2.2}
                fill={ok(0.95, 0.04, 60, 0.5)}
              />
              <path d="M84 474h9v8h-9z" stroke={CORAL} strokeWidth={1.8} />
              <path
                className="storybook-smoke"
                d="M54 446c-8-8 6-12-2-20s6-12-2-20"
                stroke={ok(0.6, 0.02, 260, 0.7)}
                strokeWidth={1.8}
              />
            </g>
            {/* A tree with two little figures playing catch under it, bottom right. */}
            <g
              transform={bottomRight}
              filter="url(#storybook-wobble)"
              visibility={showRight ? undefined : "hidden"}
            >
              <path
                d="M893 504v-34M893 486l-9-8M893 480l8-7"
                stroke={ok(0.42, 0.06, 55)}
                strokeWidth={2.4}
              />
              <path
                d="M866 470c-14 0-16-20-2-22c-2-14 16-20 24-10c8-12 30-6 28 8c14 2 12 24-2 24z"
                stroke={GREEN}
                strokeWidth={2.2}
                fill={ok(0.88, 0.09, 140, 0.55)}
              />
              {FIGURES.map((figure, i) => (
                <g
                  key={figure.x}
                  ref={(el) => void (figureRefs.current[i] = el)}
                >
                  {[-1, 1].map((side, j) => (
                    <path
                      key={side}
                      ref={(el) => void (armRefs.current[i * 2 + j] = el)}
                      d={`M${figure.x + side * 3.5} 504L${figure.x + side * 6} 506`}
                      stroke={GREEN}
                      strokeWidth={1.5}
                    />
                  ))}
                  <path
                    d={`M${figure.x - 4} 506c3-6 7-6 8 0`}
                    stroke={GREEN}
                    strokeWidth={1.8}
                  />
                  <circle
                    cx={figure.x}
                    cy={500}
                    r={3}
                    stroke={CORAL}
                    strokeWidth={1.6}
                    fill={i ? ok(0.9, 0.12, 95, 0.6) : ok(0.85, 0.1, 30, 0.6)}
                  />
                </g>
              ))}
              <circle
                ref={ballRef}
                cx={0}
                cy={0}
                r={2.7}
                stroke={CORAL}
                strokeWidth={1.2}
                fill={ok(0.92, 0.14, 95)}
                transform="translate(861 500)"
              />
            </g>
            {/* The paper plane's dotted route across the top. */}
            <path
              ref={routeRef}
              d={route}
              stroke={INK}
              strokeWidth={1.4}
              strokeDasharray="4 7"
              opacity={0.3}
            />
            <g ref={planeRef} filter="url(#storybook-wobble)">
              <path
                d="M8 0L-10 -7L-6 0L-10 7ZM-6 0L8 0"
                stroke={CORAL}
                strokeWidth={1.8}
                fill={ok(0.97, 0.02, 80)}
              />
            </g>
          </g>
        </svg>
      </div>
      <div data-theme-scene="front" aria-hidden="true">
        <div className="storybook-vignette" />
      </div>
    </>
  );
}
