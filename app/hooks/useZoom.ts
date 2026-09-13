import { useState, useEffect, useRef, useCallback } from "react";

interface UseZoomOptions {
  zoom: number;
  setZoom: (value: number) => void;
  step?: number;
  defaultZoom?: number;
  indicatorDuration?: number;
  fadeDuration?: number;
  min?: number;
  max?: number;
  keyboard?: boolean;
  wheel?: boolean;
}

interface UseZoomReturn {
  showIndicator: boolean;
  isIndicatorVisible: boolean;
}

export function useZoom(options: UseZoomOptions): UseZoomReturn {
  const {
    zoom,
    setZoom,
    step = 0.1,
    defaultZoom = 1,
    indicatorDuration = 1500,
    fadeDuration = 250,
    min = 0.5,
    max = 3,
    keyboard = true,
    wheel = true,
  } = options;

  const [showIndicator, setShowIndicator] = useState(false);
  const [isIndicatorVisible, setIsIndicatorVisible] = useState(false);
  const zoomRef = useRef(zoom);
  const indicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indicatorFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clampZoom = useCallback(
    (value: number) => Math.min(max, Math.max(min, value)),
    [min, max],
  );

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const showIndicatorTemporarily = useCallback(() => {
    setShowIndicator(true);
    setIsIndicatorVisible(true);

    if (indicatorTimerRef.current) {
      clearTimeout(indicatorTimerRef.current);
    }
    if (indicatorFadeTimerRef.current) {
      clearTimeout(indicatorFadeTimerRef.current);
    }

    indicatorTimerRef.current = setTimeout(() => {
      setIsIndicatorVisible(false);
      indicatorFadeTimerRef.current = setTimeout(() => {
        setShowIndicator(false);
      }, fadeDuration);
    }, indicatorDuration);
  }, [indicatorDuration, fadeDuration]);

  useEffect(() => {
    const changeZoom = (next: number) => {
      // Keep consecutive events cumulative before React commits another render.
      zoomRef.current = next;
      setZoom(next);
      showIndicatorTemporarily();
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -step : step;
        changeZoom(clampZoom(zoomRef.current + delta));
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          changeZoom(clampZoom(zoomRef.current + step));
        } else if (e.key === "-") {
          e.preventDefault();
          changeZoom(clampZoom(zoomRef.current - step));
        } else if (e.key === "0") {
          e.preventDefault();
          changeZoom(defaultZoom);
        }
      }
    };

    if (wheel) {
      globalThis.addEventListener("wheel", handleWheel, { passive: false });
    }
    if (keyboard) globalThis.addEventListener("keydown", handleKeyDown);

    return () => {
      if (wheel) globalThis.removeEventListener("wheel", handleWheel);
      if (keyboard) globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    setZoom,
    step,
    defaultZoom,
    clampZoom,
    showIndicatorTemporarily,
    keyboard,
    wheel,
  ]);

  useEffect(
    () => () => {
      if (indicatorTimerRef.current) {
        clearTimeout(indicatorTimerRef.current);
      }
      if (indicatorFadeTimerRef.current) {
        clearTimeout(indicatorFadeTimerRef.current);
      }
    },
    [],
  );

  return { showIndicator, isIndicatorVisible };
}
