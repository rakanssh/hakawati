import type { ThemeId } from "./registry";
import { ok, rng } from "./scenes/scene-utils";

// The desk tile, in CSS pixels. Planks run across it; it repeats seamlessly in both directions.
export const DESK_TILE = { width: 1400, height: 900 };
const PLANKS = [146, 158, 150, 142, 154, 150];

let desk: Promise<string | null> | undefined;

/**
 * Light oak planks: a tone per board, long wavy grain, darker figure bands, pores, bevelled seams and
 * staggered butt joints. Drawn once on a canvas, since noise filters only manage a blurry smear.
 */
function drawOakDesk(): Promise<string | null> {
  const { width: W, height: H } = DESK_TILE;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.scale(scale, scale);
  const r = rng(1979);

  let top = 0;
  for (const plankHeight of PLANKS) {
    const y0 = top;
    top += plankHeight;
    // Each board wraps around the tile, so its only break is the joint where two boards meet.
    const joint = r() * W;
    const u = (x: number) => (x - joint + W) % W;
    const tone = 0.765 + (r() - 0.5) * 0.045;
    const hue = 68 + (r() - 0.5) * 8;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, W, plankHeight);
    ctx.clip();
    ctx.fillStyle = ok(tone, 0.068, hue);
    ctx.fillRect(0, y0, W, plankHeight);

    // A line of grain across the board, broken only at the joint.
    const grainLine = (
      y: number,
      sway: number,
      ripple: number,
      drift: number,
      draw: (from: number, to: number) => void,
    ) => {
      const f1 = ((0.6 + r() * 2.2) * Math.PI * 2) / W;
      const f2 = ((3 + r() * 7) * Math.PI * 2) / W;
      const p1 = r() * Math.PI * 2;
      const p2 = r() * Math.PI * 2;
      const at = (x: number) => {
        const v = u(x);
        return (
          y +
          sway * Math.sin(f1 * v + p1) +
          ripple * Math.sin(f2 * v + p2) +
          drift * (v / W - 0.5)
        );
      };
      let previous = 0;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const v = u(x);
        if (x === 0 || v < previous) ctx.moveTo(x, at(x));
        else ctx.lineTo(x, at(x));
        previous = v;
      }
      draw(0, W);
      return at;
    };

    // Broad figure: soft darker and lighter bands that give the board depth.
    for (let i = 0; i < 12; i++) {
      grainLine(
        y0 + r() * plankHeight,
        2 + r() * 5,
        r() * 1.5,
        (r() - 0.5) * 40,
        () => {
          ctx.lineWidth = 5 + r() * 14;
          ctx.strokeStyle =
            i % 3 === 0
              ? ok(0.9, 0.05, 80, 0.07)
              : ok(0.5, 0.07, 55, 0.045 + r() * 0.04);
          ctx.stroke();
        },
      );
    }

    // Fine grain: many thin lines, a few of them dark latewood.
    const lines: ((x: number) => number)[] = [];
    for (let i = 0; i < 78; i++) {
      const dark = r() < 0.22;
      lines.push(
        grainLine(
          y0 + r() * plankHeight,
          1 + r() * 4,
          r() * 1.2,
          (r() - 0.5) * 50,
          () => {
            ctx.lineWidth = dark ? 0.9 + r() * 0.9 : 0.4 + r() * 0.6;
            ctx.strokeStyle = dark
              ? ok(0.45, 0.07, 52, 0.18 + r() * 0.14)
              : ok(0.55, 0.06, 58, 0.07 + r() * 0.08);
            ctx.stroke();
          },
        ),
      );
    }

    // Oak's open pores: short dark flecks lying along the grain.
    ctx.lineCap = "round";
    for (let i = 0; i < 1600; i++) {
      const line = lines[Math.floor(r() * lines.length)];
      const x = r() * W;
      const y = line(x) + (r() - 0.5) * 6;
      const length = 1.5 + r() * 3.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, line(x + length) - line(x) + y);
      ctx.lineWidth = 0.6 + r() * 0.5;
      ctx.strokeStyle = ok(0.4, 0.06, 50, 0.1 + r() * 0.14);
      ctx.stroke();
    }

    // The butt joint between two boards.
    ctx.fillStyle = ok(0.36, 0.05, 50, 0.5);
    ctx.fillRect(joint - 0.6, y0, 1.2, plankHeight);
    ctx.fillStyle = ok(0.94, 0.04, 80, 0.25);
    ctx.fillRect(joint + 0.6, y0, 1, plankHeight);
    ctx.restore();

    // A bevelled seam along the top of each plank.
    ctx.fillStyle = ok(0.34, 0.05, 50, 0.55);
    ctx.fillRect(0, y0, W, 1.3);
    ctx.fillStyle = ok(0.95, 0.04, 80, 0.3);
    ctx.fillRect(0, y0 + 1.3, W, 1);
  }

  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
      "image/jpeg",
      0.9,
    ),
  );
}

/** Draws any textures the theme needs and publishes them as CSS variables on the root element. */
export function prepareThemeTextures(id: ThemeId) {
  if (id !== "typewriter" || typeof document === "undefined") return;
  desk ??= drawOakDesk();
  void desk.then((url) => {
    if (url)
      document.documentElement.style.setProperty(
        "--typewriter-desk",
        `url("${url}")`,
      );
  });
}
