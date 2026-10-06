import type { SceneProps } from "./theme-scene";
import { useStageGeometry } from "./runtime";
import { f1, ok } from "./scene-utils";

const RIBBON_BLACK = ok(0.2, 0.005, 250);
const RIBBON_RED = ok(0.5, 0.18, 28);
const RUBBER = ok(0.2, 0.005, 250);
const STEEL = ok(0.5, 0.005, 250, 0.7);
const GOLD = ok(0.78, 0.1, 85, 0.75);

/** The machine's outline: rounded shoulders that slope out to straight sides, inset for the pinstripe. */
function bodyPath(
  cx: number,
  top: number,
  half: number,
  bottom: number,
  inset = 0,
) {
  const t = top + inset;
  const shoulder = half - 18 - inset;
  const side = half - inset;
  const r = 30 - inset * 0.6;
  return [
    `M${f1(cx - shoulder + r)} ${f1(t)}`,
    `H${f1(cx + shoulder - r)}`,
    `Q${f1(cx + shoulder)} ${f1(t)} ${f1(cx + shoulder + 7)} ${f1(t + r * 0.75)}`,
    `L${f1(cx + side)} ${f1(t + 46)}`,
    `V${f1(bottom)}H${f1(cx - side)}V${f1(t + 46)}`,
    `L${f1(cx - shoulder - 7)} ${f1(t + r * 0.75)}`,
    `Q${f1(cx - shoulder)} ${f1(t)} ${f1(cx - shoulder + r)} ${f1(t)}Z`,
  ].join("");
}

/** A ring sector, used for the windows in the spool covers. */
function sector(
  cx: number,
  cy: number,
  r1: number,
  r2: number,
  from: number,
  to: number,
) {
  const p = (r: number, a: number) =>
    `${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`;
  return `M${p(r1, from)}A${r1} ${r1} 0 0 1 ${p(r1, to)}L${p(r2, to)}A${r2} ${r2} 0 0 0 ${p(r2, from)}Z`;
}

/** A ribbon spool under a black cover, with the wound ribbon showing through three windows. */
function Spool({ x, y }: { x: number; y: number }) {
  const windows = [-90, 30, 150]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      return sector(x, y, 11, 23, a - 0.62, a + 0.62);
    })
    .join("");
  const cover = `M${x - 28} ${y}a28 28 0 1 0 56 0a28 28 0 1 0 -56 0Z${windows}`;
  return (
    <g>
      <circle
        cx={x}
        cy={y + 3}
        r={33}
        fill={ok(0, 0, 0, 0.35)}
        filter="url(#tw-soft-shadow)"
      />
      <circle cx={x} cy={y} r={32} fill="url(#tw-chrome-cap)" />
      <circle cx={x} cy={y} r={29.5} fill={ok(0.1, 0.005, 250)} />
      {/* The wound ribbon, its layers just visible. */}
      <circle
        cx={x}
        cy={y}
        r={17}
        fill="none"
        stroke={ok(0.3, 0.008, 250)}
        strokeWidth={12}
      />
      <circle
        cx={x}
        cy={y}
        r={12}
        fill="none"
        stroke={RIBBON_RED}
        strokeWidth={2}
      />
      {[14.5, 17, 19.5, 22].map((r) => (
        <circle
          key={r}
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={ok(0, 0, 0, 0.35)}
          strokeWidth={0.7}
        />
      ))}
      <path d={cover} fillRule="evenodd" fill="url(#tw-spool)" />
      <path
        d={windows}
        fill="none"
        stroke={ok(1, 0, 0, 0.22)}
        strokeWidth={1}
      />
      <circle
        cx={x}
        cy={y}
        r={28}
        fill="none"
        stroke={ok(1, 0, 0, 0.1)}
        strokeWidth={1}
      />
      <circle cx={x} cy={y} r={7} fill="url(#tw-chrome-cap)" />
      <circle cx={x} cy={y} r={2.4} fill={ok(0.25, 0.005, 250)} />
    </g>
  );
}

/**
 * Typewriter: the machine around the composer. Its body, spools and ribbon sit behind the input, which is
 * set into a well; the platen, paper bail and type guide sit in front, where the sheet of paper (the story
 * column) feeds into the machine.
 */
export default function TypewriterScene({ withSidebar }: SceneProps) {
  const { width, height, column, composer } = useStageGeometry();
  const desk = <div className="typewriter-desk scene-fill" />;
  if (!composer) {
    return (
      <div data-theme-scene="back" aria-hidden="true">
        {desk}
      </div>
    );
  }

  const cx = (composer.left + composer.right) / 2;
  const composerHalf = (composer.right - composer.left) / 2;
  const paperHalf = column
    ? Math.min((column.right - column.left) / 2, composerHalf)
    : composerHalf - 30;
  const bodyHalf = composerHalf + 110;
  const top = composer.top - 50;
  const bottom = height + 40;
  const y = composer.top - 16; // The platen's centre line.
  const spoolX = composerHalf + 60;
  const spoolY = composer.top + 26;
  const rollerHalf = paperHalf + 40;
  const bailHalf = paperHalf - 10;
  const ticks = Math.floor((bailHalf * 2 - 36) / 12);

  return (
    <>
      <div data-theme-scene="back" aria-hidden="true">
        {desk}
        <svg className="scene-fill" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient
              id="tw-body"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform={`translate(0 ${top}) scale(1 ${height - top})`}
            >
              <stop offset="0" stopColor={ok(0.36, 0.006, 250)} />
              <stop offset=".05" stopColor={ok(0.22, 0.006, 250)} />
              <stop offset=".35" stopColor={ok(0.15, 0.006, 250)} />
              <stop offset="1" stopColor={ok(0.1, 0.006, 250)} />
            </linearGradient>
            <linearGradient id="tw-chrome-cap" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={ok(0.97, 0.003, 250)} />
              <stop offset=".5" stopColor={ok(0.78, 0.004, 250)} />
              <stop offset="1" stopColor={ok(0.58, 0.006, 250)} />
            </linearGradient>
            <radialGradient id="tw-spool" cx=".38" cy=".3" r=".8">
              <stop offset="0" stopColor={ok(0.38, 0.006, 250)} />
              <stop offset=".55" stopColor={ok(0.17, 0.006, 250)} />
              <stop offset="1" stopColor={ok(0.1, 0.006, 250)} />
            </radialGradient>
            <filter
              id="tw-soft-shadow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feGaussianBlur stdDeviation={6} />
            </filter>
          </defs>
          {/* Its shadow on the desk, then a black body with a gold pinstripe. */}
          <path
            d={bodyPath(cx, top + 10, bodyHalf + 10, bottom)}
            fill={ok(0.22, 0.04, 55, 0.4)}
            filter="url(#tw-soft-shadow)"
          />
          <path d={bodyPath(cx, top, bodyHalf, bottom)} fill="url(#tw-body)" />
          <path
            d={bodyPath(cx, top, bodyHalf, bottom, 2)}
            fill="none"
            stroke={ok(1, 0, 0, 0.12)}
            strokeWidth={1.5}
          />
          <path
            d={bodyPath(cx, top, bodyHalf, bottom, 11)}
            fill="none"
            stroke={GOLD}
            strokeWidth={1}
          />
          {/* The well the input box is set into. */}
          <rect
            x={composer.left - 9}
            y={composer.top - 9}
            width={composer.right - composer.left + 18}
            height={height - composer.top + 30}
            rx={14}
            fill={ok(0.07, 0.004, 250)}
            stroke={ok(0, 0, 0, 0.6)}
            strokeWidth={2}
          />
          <path
            d={`M${composer.left - 2} ${composer.top - 9.5}H${composer.right + 2}`}
            stroke={ok(1, 0, 0, 0.09)}
            strokeWidth={1}
          />
          <Spool x={cx - spoolX} y={spoolY} />
          <Spool x={cx + spoolX} y={spoolY} />
        </svg>
      </div>
      <div data-theme-scene="front" aria-hidden="true">
        <svg className="scene-fill" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id="tw-platen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={ok(0.3, 0.005, 250)} />
              <stop offset=".2" stopColor={ok(0.5, 0.005, 250)} />
              <stop offset=".32" stopColor={ok(0.26, 0.005, 250)} />
              <stop offset=".75" stopColor={ok(0.13, 0.005, 250)} />
              <stop offset="1" stopColor={ok(0.07, 0.005, 250)} />
            </linearGradient>
            <linearGradient id="tw-chrome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={ok(0.98, 0.003, 250)} />
              <stop offset=".55" stopColor={ok(0.8, 0.004, 250)} />
              <stop offset="1" stopColor={ok(0.6, 0.006, 250)} />
            </linearGradient>
            <linearGradient id="tw-curl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={ok(0.4, 0.03, 60)} stopOpacity={0} />
              <stop
                offset="1"
                stopColor={ok(0.4, 0.03, 60)}
                stopOpacity={0.2}
              />
            </linearGradient>
            <filter id="tw-blur" x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation={3} />
            </filter>
          </defs>
          {/* The sheet darkens as it curls round the platen, under the shadow of the bail. */}
          <rect
            x={cx - paperHalf}
            y={y - 46}
            width={paperHalf * 2}
            height={32}
            fill="url(#tw-curl)"
          />
          <rect
            x={cx - rollerHalf + 10}
            y={y - 22}
            width={rollerHalf * 2 - 20}
            height={10}
            fill={ok(0.2, 0.01, 250, 0.16)}
            filter="url(#tw-blur)"
          />
          {/* The platen, with chrome collars and ribbed knobs at each end. */}
          <rect
            x={cx - rollerHalf}
            y={y - 14}
            width={rollerHalf * 2}
            height={28}
            rx={13}
            fill="url(#tw-platen)"
          />
          <rect
            x={cx - rollerHalf + 10}
            y={y - 9}
            width={rollerHalf * 2 - 20}
            height={1.5}
            rx={0.75}
            fill={ok(1, 0, 0, 0.35)}
          />
          {[-1, 1].map((side) => {
            const collar = cx + side * (rollerHalf + 3);
            const knob = cx + side * (rollerHalf + 18);
            const ribs = [-7.5, -5, -2.5, 0, 2.5, 5, 7.5]
              .map((i) => `M${knob + i} ${y - 16}V${y + 16}`)
              .join("");
            return (
              <g key={side}>
                <rect
                  x={collar - 3}
                  y={y - 13}
                  width={6}
                  height={26}
                  rx={2}
                  fill="url(#tw-chrome)"
                />
                <rect
                  x={knob - 12}
                  y={y - 19}
                  width={24}
                  height={38}
                  rx={8}
                  fill="url(#tw-platen)"
                />
                <path
                  d={ribs}
                  stroke={ok(0.55, 0.005, 250, 0.45)}
                  strokeWidth={1}
                />
              </g>
            );
          })}
          {/* The carriage-return lever, off the left end (hidden while the Game Master sidebar is open). */}
          {!withSidebar && (
            <g>
              <path
                d={`M${cx - rollerHalf - 6} ${y - 8}L${cx - rollerHalf - 36} ${y - 32}L${cx - rollerHalf - 78} ${y - 36}`}
                fill="none"
                stroke="url(#tw-chrome)"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={cx - rollerHalf - 80}
                cy={y - 36}
                r={6.5}
                fill="url(#tw-chrome)"
                stroke={ok(0.55, 0.005, 250)}
                strokeWidth={0.8}
              />
            </g>
          )}
          {/* The paper bail with its line scale and rubber rollers. */}
          <rect
            x={cx - bailHalf}
            y={y - 29}
            width={bailHalf * 2}
            height={3.5}
            rx={1.75}
            fill="url(#tw-chrome)"
          />
          <path
            d={Array.from(
              { length: ticks + 1 },
              (_, i) =>
                `M${cx - ticks * 6 + i * 12} ${y - 25.5}v${i % 5 ? 2.5 : 4.5}`,
            ).join("")}
            stroke={STEEL}
            strokeWidth={0.8}
          />
          <rect
            x={cx - bailHalf * 0.49}
            y={y - 33}
            width={24}
            height={11}
            rx={5.5}
            fill={RUBBER}
          />
          <rect
            x={cx + bailHalf * 0.42}
            y={y - 33}
            width={24}
            height={11}
            rx={5.5}
            fill={RUBBER}
          />
          {/* The type guide, the ribbon across its window, and the red mark where the next letter lands. */}
          <path
            d={`M${cx - 27} ${y - 14}L${cx - 19} ${y - 43}H${cx + 19}L${cx + 27} ${y - 14}Z`}
            fill="url(#tw-chrome)"
            stroke={ok(0.55, 0.005, 250)}
            strokeWidth={0.8}
          />
          <rect
            x={cx - 13}
            y={y - 38}
            width={26}
            height={4.5}
            fill={RIBBON_BLACK}
          />
          <rect
            x={cx - 13}
            y={y - 33.5}
            width={26}
            height={4}
            fill={RIBBON_RED}
          />
          <path
            d={`M${cx} ${y - 28}V${y - 17}`}
            stroke={RIBBON_RED}
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </>
  );
}
