import { useEffect, useRef, useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { enqueueLocalOperation } from "@/lib/local-write-queue";

const pendingAutoSaves = new Set<() => Promise<void>>();

/** Native window close and updater install do not run browser beforeunload. */
export async function flushPendingAutoSaves(): Promise<void> {
  // Inline editors commit on blur; publish those React changes before saving.
  flushSync(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await Promise.all(Array.from(pendingAutoSaves, (flush) => flush()));
  // Log edits and other immediate saves also use this existing write queue.
  await enqueueLocalOperation(async () => undefined);
}

interface UseAutoSaveOptions<T> {
  data: T;
  save: (data: T) => Promise<void>;
  debounceMs?: number;
  disabled?: boolean;
  warnOnLeave?: boolean;
  scopeKey?: string;
}

interface UseAutoSaveReturn {
  hasUnsavedChanges: boolean;
  saveNow: () => Promise<void>;
}

export function useAutoSave<T>(
  options: UseAutoSaveOptions<T>,
): UseAutoSaveReturn {
  const {
    data,
    save,
    debounceMs = 2000,
    disabled = false,
    warnOnLeave = true,
    scopeKey,
  } = options;

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const revisionRef = useRef(0);
  const inFlightSavesRef = useRef(new Set<Promise<void>>());
  const pendingSaveRef = useRef<{
    run: () => Promise<void>;
    disabled: boolean;
  } | null>(null);
  const isFirstRenderRef = useRef(true);

  const saveNow = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const revision = revisionRef.current;
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    const operation = (async () => save(data))();
    inFlightSavesRef.current.add(operation);
    try {
      await operation;
      if (revisionRef.current === revision) {
        hasUnsavedChangesRef.current = false;
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      if (revisionRef.current === revision && !pendingSaveRef.current) {
        pendingSaveRef.current = pending;
      }
      throw error;
    } finally {
      inFlightSavesRef.current.delete(operation);
    }
  }, [data, save]);

  const flush = useCallback(async () => {
    while (pendingSaveRef.current || inFlightSavesRef.current.size) {
      if (pendingSaveRef.current?.disabled) {
        throw new Error(
          "Stop generation before closing or installing an update.",
        );
      }
      if (inFlightSavesRef.current.size) {
        await Promise.all(inFlightSavesRef.current);
      } else {
        await pendingSaveRef.current?.run();
      }
    }
  }, []);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    revisionRef.current += 1;
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
    pendingSaveRef.current = { run: saveNow, disabled };
    if (disabled) return;

    debounceTimerRef.current = setTimeout(() => {
      saveNow().catch((error) => {
        console.error("Auto-save failed:", error);
      });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [data, saveNow, debounceMs, disabled]);

  useEffect(
    () => () => {
      const pending = pendingSaveRef.current;
      if (pending && !pending.disabled) {
        // This callback owns the previous scope's snapshot; it must not read
        // whichever tale happens to be active when the write is processed.
        void pending
          .run()
          .catch((error) => console.error("Auto-save on leave failed:", error));
      } else {
        pendingSaveRef.current = null;
      }
    },
    [scopeKey],
  );

  useEffect(() => {
    let mounted = true;
    const registeredFlush = async () => {
      await flush();
      if (!mounted) pendingAutoSaves.delete(registeredFlush);
    };
    pendingAutoSaves.add(registeredFlush);
    return () => {
      mounted = false;
      if (pendingSaveRef.current?.disabled) {
        pendingAutoSaves.delete(registeredFlush);
        return;
      }
      // Keep a departing page's save visible to close/install until it settles.
      void registeredFlush().catch(() => undefined);
    };
  }, [flush]);

  useEffect(() => {
    if (!warnOnLeave) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [warnOnLeave]);

  return {
    hasUnsavedChanges,
    saveNow,
  };
}
