import { useEffect, useRef, useCallback } from "react";

interface UseAutoSaveOptions<T> {
  data: T;
  save: () => Promise<void>;
  debounceMs?: number;
  disabled?: boolean;
  warnOnLeave?: boolean;
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
  } = options;

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const isFirstRenderRef = useRef(true);

  const saveNow = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await save();
    hasUnsavedChangesRef.current = false;
  }, [save]);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    if (disabled) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    hasUnsavedChangesRef.current = true;

    debounceTimerRef.current = setTimeout(() => {
      save()
        .then(() => {
          hasUnsavedChangesRef.current = false;
        })
        .catch((error) => {
          console.error("Auto-save failed:", error);
        });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [data, save, debounceMs, disabled]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    hasUnsavedChanges: hasUnsavedChangesRef.current,
    saveNow,
  };
}
