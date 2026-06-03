import { useRef, useState, useCallback } from "react";

interface UseStickToBottomOptions {
  threshold?: number;
  scrollBehavior?: ScrollBehavior;
  infiniteScroll?: {
    loadThreshold: number;
    debounceMs: number;
    hasMore: boolean;
    isLoading: boolean;
    onLoadMore: () => Promise<void>;
  };
}

interface UseStickToBottomReturn {
  stickToBottom: boolean;
  setStickToBottom: (value: boolean) => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  handleScroll: () => void;
  loadingOlder: boolean;
}

export function useStickToBottom(
  options: UseStickToBottomOptions = {},
): UseStickToBottomReturn {
  const { threshold = 64, scrollBehavior = "smooth", infiniteScroll } = options;

  const [stickToBottom, setStickToBottom] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const loadDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = scrollBehavior) => {
      setStickToBottom(true);
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    },
    [scrollBehavior],
  );

  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setStickToBottom(distanceFromBottom <= threshold);

    if (infiniteScroll && !loadingOlder && !infiniteScroll.isLoading) {
      const { loadThreshold, debounceMs, hasMore, onLoadMore } = infiniteScroll;

      if (el.scrollTop < loadThreshold && hasMore) {
        if (loadDebounceTimerRef.current) {
          clearTimeout(loadDebounceTimerRef.current);
        }

        loadDebounceTimerRef.current = setTimeout(() => {
          setLoadingOlder(true);

          const scrollHeightBefore = el.scrollHeight;
          const scrollTopBefore = el.scrollTop;

          onLoadMore().finally(() => {
            setLoadingOlder(false);

            requestAnimationFrame(() => {
              if (viewportRef.current) {
                const scrollHeightAfter = viewportRef.current.scrollHeight;
                const heightDiff = scrollHeightAfter - scrollHeightBefore;
                viewportRef.current.scrollTop = scrollTopBefore + heightDiff;
              }
            });
          });
        }, debounceMs);
      }
    }
  }, [threshold, infiniteScroll, loadingOlder]);

  return {
    stickToBottom,
    setStickToBottom,
    viewportRef,
    bottomRef,
    scrollToBottom,
    handleScroll,
    loadingOlder,
  };
}
