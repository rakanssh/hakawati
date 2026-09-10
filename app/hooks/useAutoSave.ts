import { useEffect, useRef, useCallback, useState } from "react";

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
    pendingSaveRef.current = null;
    await save(data);
    if (revisionRef.current === revision) {
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
    }
  }, [data, save]);

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
      pendingSaveRef.current = null;
      if (pending && !pending.disabled) {
        // This callback owns the previous scope's snapshot; it must not read
        // whichever tale happens to be active when the write is processed.
        void pending
          .run()
          .catch((error) => console.error("Auto-save on leave failed:", error));
      }
    },
    [scopeKey],
  );

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
