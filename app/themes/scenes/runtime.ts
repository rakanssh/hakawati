import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useThemeScenery } from "@/hooks/useThemeScenery";

/** Viewport-space box, in CSS pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where the play screen's parts sit, so scenes can keep bright detail out of the reading column. */
export interface StageGeometry {
  width: number;
  height: number;
  /** The scrolling story area, between the title bar and the composer. */
  stage: Box | null;
  /** The reading column's horizontal extent (its vertical extent scrolls). */
  column: { left: number; right: number } | null;
  composer: Box | null;
}

/** Time used to draw a still frame when scenery is paused. */
export const STILL_TIME = 9;

const toBox = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

function measureStage(): StageGeometry {
  const column = toBox(document.querySelector("[data-play-column]"));
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    stage: toBox(document.querySelector("[data-play-stage]")),
    column: column ? { left: column.left, right: column.right } : null,
    composer: toBox(document.querySelector("[data-composer-surface]")),
  };
}

const sameBox = (a: Partial<Box> | null, b: Partial<Box> | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.round(a.left ?? 0) === Math.round(b.left ?? 0) &&
    Math.round(a.right ?? 0) === Math.round(b.right ?? 0) &&
    Math.round(a.top ?? 0) === Math.round(b.top ?? 0) &&
    Math.round(a.bottom ?? 0) === Math.round(b.bottom ?? 0));

const sameGeometry = (a: StageGeometry, b: StageGeometry) =>
  a.width === b.width &&
  a.height === b.height &&
  sameBox(a.stage, b.stage) &&
  sameBox(a.column, b.column) &&
  sameBox(a.composer, b.composer);

/** Tracks the play screen's layout as the window, sidebar and composer change size. */
export function useStageGeometry(): StageGeometry {
  const [geometry, setGeometry] = useState(measureStage);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setGeometry((previous) => {
          const next = measureStage();
          return sameGeometry(previous, next) ? previous : next;
        }),
      );
    };

    const resizeObserver = new ResizeObserver(update);
    let observed: Element[] = [];
    const watchParts = () => {
      const parts = [
        document.documentElement,
        document.querySelector("[data-play-stage]"),
        document.querySelector("[data-play-column]"),
        document.querySelector("[data-composer-surface]"),
      ].filter((el): el is Element => !!el);
      if (
        parts.length === observed.length &&
        parts.every((el, i) => el === observed[i])
      )
        return false;
      resizeObserver.disconnect();
      parts.forEach((el) => resizeObserver.observe(el));
      observed = parts;
      return true;
    };
    watchParts();
    update();

    // The stage and composer mount after the tale loads and remount when the mode changes.
    const mutationObserver = new MutationObserver(() => {
      if (watchParts()) update();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return geometry;
}

/** Whether scenes move: the Scenery setting, or the system's reduced-motion preference until one is picked. */
export function useSceneAnimated() {
  return useThemeScenery() === "animated";
}

type FrameSubscriber = {
  draw: (time: number) => void;
  interval: number;
  last: number;
};

// One requestAnimationFrame loop drives every scene, each at its own frame rate.
const subscribers = new Set<FrameSubscriber>();
let loopFrame = 0;

function tick(now: number) {
  loopFrame = 0;
  if (!document.hidden) {
    for (const subscriber of subscribers) {
      if (now - subscriber.last < subscriber.interval) continue;
      subscriber.last = now;
      subscriber.draw(now / 1000);
    }
  }
  if (subscribers.size) loopFrame = requestAnimationFrame(tick);
}

/**
 * Calls `draw(seconds)` on the shared animation loop while `animated`, at up to `fps` frames a second.
 * When still, draws a single frame instead (and again whenever `draw` changes).
 */
export function useSceneFrame(
  draw: (time: number) => void,
  { animated, fps = 30 }: { animated: boolean; fps?: number },
) {
  const drawRef = useRef(draw);
  useLayoutEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    if (!animated) return;
    const subscriber: FrameSubscriber = {
      draw: (time) => drawRef.current(time),
      interval: 1000 / fps - 2,
      last: 0,
    };
    subscribers.add(subscriber);
    if (!loopFrame) loopFrame = requestAnimationFrame(tick);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size && loopFrame) {
        cancelAnimationFrame(loopFrame);
        loopFrame = 0;
      }
    };
  }, [animated, fps]);

  // A still scene redraws when its inputs (and so `draw`) change.
  useEffect(() => {
    if (!animated) draw(STILL_TIME);
  }, [animated, draw]);
}

export interface SceneCanvas {
  ctx: CanvasRenderingContext2D;
  ratio: number;
  width: number;
  height: number;
}

/** Clears the canvas and sets it up for drawing in CSS pixels. */
export function beginFrame({ ctx, ratio, width, height }: SceneCanvas) {
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
}

/**
 * Sizes a full-window canvas to the device's pixel density. Returns null until the canvas has mounted,
 * and a new object after every resize so draw callbacks built from it are rebuilt.
 */
export function useSceneCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
  maxPixelRatio = 2,
): SceneCanvas | null {
  const [canvas, setCanvas] = useState<SceneCanvas | null>(null);
  useEffect(() => {
    const element = canvasRef.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    element.width = Math.max(1, Math.round(width * ratio));
    element.height = Math.max(1, Math.round(height * ratio));
    setCanvas({ ctx, ratio, width, height });
  }, [canvasRef, width, height, maxPixelRatio]);
  return canvas;
}
