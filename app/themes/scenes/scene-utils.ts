export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** A small deterministic random generator, so a scene looks the same every time it is drawn. */
export function rng(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/** An OKLCH colour string, with optional alpha from 0 to 1. */
export function ok(l: number, c: number, h: number, alpha?: number) {
  const base = `oklch(${+l.toFixed(3)} ${+c.toFixed(3)} ${+h.toFixed(1)}`;
  return alpha == null ? `${base})` : `${base} / ${Math.round(alpha * 100)}%)`;
}

export const f1 = (value: number) => (+value).toFixed(1);

/** A wavy horizon: the sum of a few sine waves, optionally folded into sharp ridges. */
export function wave(
  seed: number,
  base: number,
  amplitude: number,
  frequency = 0.006,
  octaves = 4,
  sharp = false,
) {
  const r = rng(seed);
  const waves = Array.from({ length: octaves }, (_, i) => ({
    a: (amplitude * (0.6 + r() * 0.6)) / (1 + i * 0.9),
    f: frequency * (1 + i * 1.8) * (0.75 + r() * 0.5),
    p: r() * TAU,
  }));
  return (x: number) => {
    let y = base;
    for (const w of waves) {
      const s = Math.sin(w.f * x + w.p);
      y -= sharp ? w.a * (1 - Math.abs(s)) : w.a * s;
    }
    return y;
  };
}

/** A many-pointed star outline, as SVG path data. */
export function starPath(
  cx: number,
  cy: number,
  radius: number,
  inner = 0.6,
  points = 8,
  rotation = 0,
) {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? radius * inner : radius;
    const a = rotation + (i * Math.PI) / points - Math.PI / 2;
    d += `${i ? "L" : "M"}${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`;
  }
  return `${d}Z`;
}

/** A soft four-point sparkle, as SVG path data. */
export function sparklePath(x: number, y: number, s: number) {
  const k = s * 0.16;
  return `M${f1(x)} ${f1(y - s)}Q${f1(x + k)} ${f1(y - k)} ${f1(x + s)} ${f1(y)}Q${f1(x + k)} ${f1(y + k)} ${f1(x)} ${f1(y + s)}Q${f1(x - k)} ${f1(y + k)} ${f1(x - s)} ${f1(y)}Q${f1(x - k)} ${f1(y - k)} ${f1(x)} ${f1(y - s)}Z`;
}
