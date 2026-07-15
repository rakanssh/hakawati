import { useCallback, useEffect, useRef, useState } from "react";
import {
  completePendingTaleTurn,
  commitTaleTurn,
  editTaleLogEntry,
  getTaleById,
  persistCurrentTale,
  redoTaleLogEntry,
  retryTaleLogEntry,
  retryTaleTurn,
  undoTaleLogToEntryCount,
  type TaleMutableSnapshot,
} from "@/services/tale.service";
import type { LogEntry } from "@/types/log.type";
import { DEFAULT_WINDOW_SIZE, useTaleStore } from "@/store/useTaleStore";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import { wakeSyncBackground } from "@/services/sync-wakeup";

function snapshotMutableTale(): TaleMutableSnapshot {
  const state = useTaleStore.getState();
  return {
    name: state.name,
    description: state.description,
    components: state.components,
    storyCards: state.storyCards,
    stats: state.stats,
    inventory: state.inventory,
    gameMode: state.gameMode,
    undoStack: state.undoStack,
  };
}

export function usePersistTale() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastSaveSuccess, setLastSaveSuccess] = useState(false);
  const pendingSaveCountRef = useRef(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    [],
  );

  const runPersist = useCallback(async (operation: () => Promise<void>) => {
    pendingSaveCountRef.current += 1;
    setSaving(true);
    setLastSaveSuccess(false);
    setError(null);
    try {
      await operation();
      setLastSaveSuccess(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null;
        setLastSaveSuccess(false);
      }, 2000);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      pendingSaveCountRef.current = Math.max(
        0,
        pendingSaveCountRef.current - 1,
      );
      setSaving(pendingSaveCountRef.current > 0);
    }
  }, []);

  const runTalePersist = useCallback(
    async (_taleId: string, operation: () => Promise<void>) => {
      await runPersist(async () => {
        await operation();
        wakeSyncBackground();
      });
    },
    [runPersist],
  );

  const save = useCallback(
    async (taleId: string) => {
      await runTalePersist(taleId, () =>
        persistCurrentTale({
          id: taleId,
          tale: snapshotMutableTale(),
        }),
      );
    },
    [runTalePersist],
  );

  const saveTurn = useCallback(
    async (taleId: string, entries: LogEntry[], createdAt = Date.now()) => {
      await runTalePersist(taleId, () =>
        commitTaleTurn({
          id: taleId,
          tale: snapshotMutableTale(),
          entries,
          createdAt,
        }),
      );
    },
    [runTalePersist],
  );

  const completePendingTurn = useCallback(
    async (
      taleId: string,
      pendingEntries: LogEntry[],
      entries: LogEntry[],
      createdAt = Date.now(),
      fallbackToAppend = false,
    ) => {
      await runTalePersist(taleId, () =>
        completePendingTaleTurn({
          id: taleId,
          tale: snapshotMutableTale(),
          pendingEntries,
          entries,
          createdAt,
          fallbackToAppend,
        }),
      );
    },
    [runTalePersist],
  );

  const retryTurn = useCallback(
    async (
      taleId: string,
      previousEntries: LogEntry[],
      entries: LogEntry[],
      createdAt = Date.now(),
    ) => {
      await runTalePersist(taleId, () =>
        retryTaleTurn({
          id: taleId,
          tale: snapshotMutableTale(),
          previousEntries,
          entries,
          createdAt,
        }),
      );
    },
    [runTalePersist],
  );

  const undoToEntryCount = useCallback(
    async (taleId: string, entryCount?: number) => {
      const state = useTaleStore.getState();
      await runTalePersist(taleId, () =>
        undoTaleLogToEntryCount({
          id: taleId,
          tale: snapshotMutableTale(),
          entryCount: entryCount ?? state.totalLogCount,
        }),
      );
    },
    [runTalePersist],
  );

  const editEntry = useCallback(
    async (
      taleId: string,
      entryId: string,
      patch: Partial<Omit<LogEntry, "id">>,
    ) => {
      await runTalePersist(taleId, () =>
        editTaleLogEntry({
          id: taleId,
          tale: snapshotMutableTale(),
          entryId,
          patch,
        }),
      );
    },
    [runTalePersist],
  );

  const retryEntry = useCallback(
    async (
      taleId: string,
      previousEntry: LogEntry,
      replacementEntry: LogEntry,
    ) => {
      await runTalePersist(taleId, () =>
        retryTaleLogEntry({
          id: taleId,
          tale: snapshotMutableTale(),
          previousEntry,
          replacementEntry,
        }),
      );
    },
    [runTalePersist],
  );

  const redoEntry = useCallback(
    async (taleId: string, entry: LogEntry, createdAt = Date.now()) => {
      await runTalePersist(taleId, () =>
        redoTaleLogEntry({
          id: taleId,
          tale: snapshotMutableTale(),
          entry,
          createdAt,
        }),
      );
    },
    [runTalePersist],
  );

  return {
    save,
    saveTurn,
    completePendingTurn,
    retryTurn,
    undoToEntryCount,
    editEntry,
    retryEntry,
    redoEntry,
    saving,
    error,
    lastSaveSuccess,
  } as const;
}

export function useLoadTale() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const loadingIdRef = useRef<string | null>(null);

  const load = useCallback(async (taleId: string) => {
    if (loadingIdRef.current === taleId) {
      return;
    }

    // If we switch tales mid-load, the previous load will be ignored via the token check below
    loadingIdRef.current = taleId;
    const myToken = taleId;

    setLoading(true);
    setError(null);

    try {
      const tale = await getTaleById(taleId);

      if (loadingIdRef.current !== myToken) {
        return;
      }

      if (!tale) throw new Error("Tale not found");

      useTaleStore.setState({
        id: tale.id,
        name: tale.name,
        description: tale.description,
        components: tale.components,
        storyCards: tale.storyCards,
        stats: tale.stats,
        inventory: tale.inventory,
        log: tale.log,
        gameMode: tale.gameMode,
        undoStack: tale.undoStack,
        totalLogCount: tale.totalLogCount,
        oldestLoadedIndex: tale.oldestLoadedIndex,
        logWindowSize: DEFAULT_WINDOW_SIZE,
        isLoadingOlderEntries: false,
      });

      useLastPlayedStore.getState().setLastPlayedTaleId(taleId);
    } catch (e) {
      if (loadingIdRef.current === myToken) {
        setError(e);
        throw e;
      }
    } finally {
      if (loadingIdRef.current === myToken) {
        setLoading(false);
        loadingIdRef.current = null;
      }
    }
  }, []);

  return { load, loading, error } as const;
}
