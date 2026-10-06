import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSceneAnimated, useSceneFrame, useStageGeometry } from "./runtime";
import { clamp, rng, TAU, wave } from "./scene-utils";

// The round-two sunset palette, top to bottom.
const SKY = [
  "#160c2e",
  "#22113f",
  "#341752",
  "#4f1d63",
  "#74286f",
  "#a23a72",
  "#d4566e",
  "#f27d63",
  "#ffb065",
];

/**
 * Cartridge: an 8-bit sunset with a castle on its hill under the story, pines to either side and the moon
 * off to one side. Drawn at low resolution (about 150 pixels tall) and scaled up with hard pixel edges.
 */
export default function CartridgeScene() {
  const { width, height, column } = useStageGeometry();
  const animated = useSceneAnimated();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  const pixel = Math.max(2, Math.round(height / 150));
  const w = Math.ceil(width / pixel);
  const h = Math.ceil(height / pixel);
  const columnLeft = column ? column.left / pixel : w / 2 - 83;
  const columnRight = column ? column.right / pixel : w / 2 + 83;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = w;
    canvas.height = h;
    setCtx(canvas.getContext("2d"));
  }, [w, h]);

  const world = useMemo(() => {
    const r = rng(111);
    const dy = h - 150; // Ground features sit on the bottom edge.
    const cx = Math.round((columnLeft + columnRight) / 2);
    const k = clamp((columnRight - columnLeft) / 2 / 83, 0.6, 1.6);
    const moonX = Math.round(
      clamp(Math.max(columnRight + 14, cx + 40), 12, w - 12),
    );
    const stars: { x: number; y: number; phase: number; speed: number }[] = [];
    for (
      let guard = 0;
      stars.length < Math.round((50 * w) / 240) && guard < 4000;
      guard++
    ) {
      const x = Math.floor(r() * w);
      const y = Math.floor(r() * (60 + dy * 0.5));
      if (Math.abs(x - moonX) < 13 && y < 36) continue;
      stars.push({ x, y, phase: r() * TAU, speed: 0.2 + r() * 0.45 });
    }
    const far = wave(113, 112, 20, 0.035, 3, true);
    const mid = wave(117, 122, 10, 0.05, 3, true);
    const farLine = Array.from({ length: w }, (_, x) =>
      Math.round(far(Math.abs(x - cx)) + dy),
    );
    const midLine = Array.from({ length: w }, (_, x) =>
      Math.round(mid(Math.abs(x - cx) + 7) + dy),
    );
    const hill = Array.from({ length: w }, (_, x) =>
      Math.round(128 - 18 * Math.exp(-Math.pow((x - cx) / 36, 2)) + dy),
    );
    const trees = [44, 56, 70, 86, 100, 118, 136]
      .map((offset) => Math.round(offset * k))
      .flatMap((offset, i) => [
        { x: cx - offset, h: 12 + ((i * 5) % 9) },
        { x: cx + offset, h: 12 + ((i * 7) % 9) },
      ])
      .filter((tree) => tree.x > 2 && tree.x < w - 2);
    const flies = Array.from({ length: Math.round((12 * w) / 240) }, () => ({
      x: Math.floor(r() * w),
      y: 120 + dy + Math.floor(r() * 24),
      phase: r() * TAU,
      speed: 0.8 + r() * 1.5,
    }));
    const clouds = [
      { x: 20, y: 30, w: 20 },
      { x: 130, y: 46, w: 26 },
      { x: 205, y: 40, w: 14 },
      { x: 300, y: 34, w: 22 },
    ];
    return {
      cx,
      dy,
      moonX,
      stars,
      farLine,
      midLine,
      hill,
      trees,
      flies,
      clouds,
    };
  }, [w, h, columnLeft, columnRight]);

  const draw = useCallback(
    (t: number) => {
      if (!ctx) return;
      const { cx, dy, moonX, hill } = world;
      const px = (x: number, y: number, pw = 1, ph = 1) =>
        ctx.fillRect(x | 0, y | 0, pw, ph);

      // Sky in bands, dithered where they meet.
      const bandHeight = Math.max(8, Math.round(11 * (h / 150)));
      SKY.forEach((colour, i) => {
        ctx.fillStyle = colour;
        px(0, i * bandHeight, w, i === SKY.length - 1 ? h : bandHeight);
      });
      for (let i = 1; i < SKY.length; i++) {
        const y = i * bandHeight;
        ctx.fillStyle = SKY[i];
        for (let x = 0; x < w; x++) {
          if (x % 2 === 0) px(x, y - 1);
          if (x % 4 === 1) px(x, y - 2);
        }
        ctx.fillStyle = SKY[i - 1];
        for (let x = 0; x < w; x++) {
          if (x % 2 === 1) px(x, y);
          if (x % 4 === 3) px(x, y + 1);
        }
      }

      // Stars twinkle slowly.
      ctx.fillStyle = "#fff6d8";
      for (const s of world.stars) {
        const v = Math.sin(t * s.speed + s.phase);
        if (v < -0.2) continue;
        px(s.x, s.y);
        if (v > 0.9) {
          px(s.x - 1, s.y, 3, 1);
          px(s.x, s.y - 1, 1, 3);
        }
      }

      // The moon, off to the side of the story.
      ctx.fillStyle = "#ffe9b5";
      for (let my = -9; my <= 9; my++)
        for (let mx = -9; mx <= 9; mx++)
          if (mx * mx + my * my <= 81) px(moonX + mx, 24 + my);
      ctx.fillStyle = "#e8c98c";
      px(moonX - 4, 20, 2, 2);
      px(moonX + 3, 27, 3, 2);
      px(moonX - 1, 30, 1, 1);

      for (const cloud of world.clouds) {
        const x = Math.floor((cloud.x + t * 3) % (w + 50)) - 40;
        ctx.fillStyle = "#ff9e7a";
        px(x, cloud.y, cloud.w, 3);
        px(x + 3, cloud.y - 2, cloud.w - 8, 2);
        px(x + 6, cloud.y - 4, cloud.w - 14, 2);
      }

      // Ridges, then the castle's hill.
      ctx.fillStyle = "#3b1f5e";
      for (let x = 0; x < w; x++)
        px(x, world.farLine[x], 1, h - world.farLine[x]);
      ctx.fillStyle = "#2a1548";
      for (let x = 0; x < w; x++)
        px(x, world.midLine[x], 1, h - world.midLine[x]);
      ctx.fillStyle = "#1c0f33";
      for (let x = 0; x < w; x++) px(x, hill[x], 1, h - hill[x]);

      // The castle, centred on the hill under the story column.
      const by = hill[clamp(cx, 0, w - 1)];
      px(cx - 7, by - 30, 14, 30);
      for (let i = 0; i < 7; i++) px(cx - 7 + i * 2, by - 32, 1, 2);
      px(cx - 19, by - 22, 6, 22);
      px(cx + 13, by - 22, 6, 22);
      for (const tx of [cx - 19, cx + 13]) {
        px(tx - 1, by - 23, 8, 1);
        px(tx, by - 25, 6, 2);
        px(tx + 1, by - 27, 4, 2);
        px(tx + 2, by - 29, 2, 2);
      }
      px(cx - 13, by - 14, 6, 14);
      px(cx + 7, by - 14, 6, 14);
      for (const wx of [cx - 13, cx + 7])
        for (let i = 0; i < 3; i++) px(wx + i * 2, by - 16, 1, 2);
      px(cx, by - 40, 1, 8);
      ctx.fillStyle = "#74286f";
      px(cx + 6, by - 30, 1, 26);
      px(cx + 18, by - 22, 1, 20);
      px(cx + 12, by - 14, 1, 12);
      // A flag on the keep, flapping.
      ctx.fillStyle = "#ffd66b";
      if (Math.floor(t * 3) % 2) {
        px(cx + 1, by - 40, 4, 1);
        px(cx + 1, by - 39, 5, 1);
        px(cx + 1, by - 38, 3, 1);
      } else {
        px(cx + 1, by - 40, 3, 1);
        px(cx + 1, by - 39, 5, 1);
        px(cx + 2, by - 38, 3, 1);
      }
      [
        [cx - 3, by - 24],
        [cx + 2, by - 24],
        [cx - 1, by - 16],
        [cx - 17, by - 16],
        [cx + 15, by - 16],
      ].forEach(([wx, wy], i) => {
        ctx.fillStyle =
          Math.sin(t * (0.7 + i * 0.37) + i * 2) > -0.6 ? "#ffd66b" : "#2a1745";
        px(wx, wy, 1, 2);
      });
      ctx.fillStyle = "#ffb44a";
      px(cx - 1, by - 5, 3, 5);

      // Pines on the hillside, and the ground.
      ctx.fillStyle = "#140a26";
      for (const tree of world.trees) {
        const ty = hill[clamp(tree.x, 0, w - 1)] + 2;
        for (let i = 0; i < tree.h; i++) {
          const half = Math.floor(i / 2) + 1;
          px(tree.x - half + 1, ty - tree.h + i, half * 2 - 1, 1);
        }
        px(tree.x, ty, 1, 3);
      }
      px(0, 142 + dy, w, h);

      // Fireflies.
      ctx.fillStyle = "#e8ff7a";
      for (const fly of world.flies)
        if (Math.sin(t * fly.speed + fly.phase) > 0.55)
          px(fly.x + Math.round(2 * Math.sin(t * 0.7 + fly.phase)), fly.y);
    },
    [ctx, world, w, h],
  );
  useSceneFrame(draw, { animated, fps: 12 });

  return (
    <div data-theme-scene="back" aria-hidden="true">
      <canvas
        ref={canvasRef}
        style={{
          width: w * pixel,
          height: h * pixel,
          right: "auto",
          bottom: "auto",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
