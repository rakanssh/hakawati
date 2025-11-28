import { useState, useEffect, useRef, useCallback } from "react";

interface UseZoomOptions {
  zoom: number;
  setZoom: (value: number) => void;
  step?: number;
  defaultZoom?: number;
  indicatorDuration?: number;
  min?: number;
  max?: number;
}

interface UseZoomReturn {
  showIndicator: boolean;
}

export function useZoom(options: UseZoomOptions): UseZoomReturn {
  const {
    zoom,
    setZoom,
    step = 0.1,
    defaultZoom = 1,
    indicatorDuration = 1500,
    min = 0.5,
    max = 3,
  } = options;

  const [showIndicator, setShowIndicator] = useState(false);
  const indicatorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clampZoom = useCallback(
    (value: number) => Math.min(max, Math.max(min, value)),
    [min, max],
  );

  const showIndicatorTemporarily = useCallback(() => {
    setShowIndicator(true);
    if (indicatorTimerRef.current) {
      clearTimeout(indicatorTimerRef.current);
    }
    indicatorTimerRef.current = setTimeout(() => {
      setShowIndicator(false);
    }, indicatorDuration);
  }, [indicatorDuration]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -step : step;
        setZoom(clampZoom(zoom + delta));
        showIndicatorTemporarily();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          setZoom(clampZoom(zoom + step));
          showIndicatorTemporarily();
        } else if (e.key === "-") {
          e.preventDefault();
          setZoom(clampZoom(zoom - step));
          showIndicatorTemporarily();
        } else if (e.key === "0") {
          e.preventDefault();
          setZoom(defaultZoom);
          showIndicatorTemporarily();
        }
      }
    };

    globalThis.addEventListener("wheel", handleWheel, { passive: false });
    globalThis.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.removeEventListener("wheel", handleWheel);
      globalThis.removeEventListener("keydown", handleKeyDown);
      if (indicatorTimerRef.current) {
        clearTimeout(indicatorTimerRef.current);
      }
    };
  }, [zoom, setZoom, step, defaultZoom, clampZoom, showIndicatorTemporarily]);

  return { showIndicator };
}
