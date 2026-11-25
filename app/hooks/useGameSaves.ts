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
import { showSavedTale } from "@/services/open-tale-sync";
import { beginPlayActivity } from "@/store/usePlayActivityStore";

function snapshotMutableTale(taleId: string): TaleMutableSnapshot {
  const state = useTaleStore.getState();
  if (state.id !== taleId)
    throw new Error("The active tale changed before this save.");
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
    const endSaving = beginPlayActivity("saving");
    pendingSaveCountRef.current += 1;
    setSaving(true);
    setLastSaveSuccess(false);
    setError(null);
    try {
      await operation();
      wakeSyncBackground();
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
      endSaving();
      pendingSaveCountRef.current = Math.max(
        0,
        pendingSaveCountRef.current - 1,
      );
      setSaving(pendingSaveCountRef.current > 0);
    }
  }, []);

  const runLogPersist = useCallback(
    (taleId: string, operation: () => Promise<void>) =>
      runPersist(() =>
        operation().catch(async (error) => {
          // Setup fields stay as they are, since autosave keeps retrying them.
          await showSavedTale(taleId, { keepSetup: true }).catch(
            (reloadError) =>
              console.error("Failed to reload the saved tale:", reloadError),
          );
          throw error;
        }),
      ),
    [runPersist],
  );

  const save = useCallback(
    async (taleId: string, snapshot?: TaleMutableSnapshot) => {
      await runPersist(() =>
        persistCurrentTale({
          id: taleId,
          tale: snapshot ?? snapshotMutableTale(taleId),
        }),
      );
    },
    [runPersist],
  );

  const saveTurn = useCallback(
    async (taleId: string, entries: LogEntry[], createdAt = Date.now()) => {
      await runLogPersist(taleId, () =>
        commitTaleTurn({
          id: taleId,
          tale: snapshotMutableTale(taleId),
          entries,
          createdAt,
        }),
      );
    },
    [runLogPersist],
  );

  const completePendingTurn = useCallback(
    async (
      taleId: string,
      pendingEntries: LogEntry[],
      entries: LogEntry[],
      createdAt = Date.now(),
      fallbackToAppend = false,
    ) => {
      await runLogPersist(taleId, () =>
        completePendingTaleTurn({
          id: taleId,
          tale: snapshotMutableTale(taleId),
          pendingEntries,
          entries,
          createdAt,
          fallbackToAppend,
        }),
      );
    },
    [runLogPersist],
  );

  const retryTurn = useCallback(
    async (
      taleId: string,
      previousEntries: LogEntry[],
      entries: LogEntry[],
      createdAt = Date.now(),
    ) => {
      await runLogPersist(taleId, () =>
        retryTaleTurn({
          id: taleId,
          tale: snapshotMutableTale(taleId),
          previousEntries,
          entries,
          createdAt,
        }),
      );
    },
    [runLogPersist],
  );

  const undoToEntryCount = useCallback(
    async (taleId: string, entryCount?: number) => {
      const state = useTaleStore.getState();
      await runLogPersist(taleId, () =>
        undoTaleLogToEntryCount({
          id: taleId,
          tale: snapshotMutableTale(taleId),
          entryCount: entryCount ?? state.totalLogCount,
        }),
      );
    },
    [runLogPersist],
  );

  const editEntry = useCallback(
    async (
      taleId: string,
      entryId: string,
      patch: Partial<Omit<LogEntry, "id">>,
    ) => {
      await runLogPersist(taleId, () =>
        editTaleLogEntry({
          id: taleId,
          tale: snapshotMutableTale(taleId),
          entryId,
          patch,
        }),
      );
    },
    [runLogPersist],
  );

  const retryEntry = useCallback(
    async (
      taleId: string,
      previousEntry: LogEntry,
      replacementEntry: LogEntry,
    ) => {
      await runLogPersist(taleId, () =>
        retryTaleLogEntry({
          id: taleId,
          tale: snapshotMutableTale(taleId),
          previousEntry,
          replacementEntry,
        }),
      );
    },
    [runLogPersist],
  );

  const redoEntry = useCallback(
    async (taleId: string, entry: LogEntry, createdAt = Date.now()) => {
      await runLogPersist(taleId, () =>
        redoTaleLogEntry({
          id: taleId,
          tale: snapshotMutableTale(taleId),
          entry,
          createdAt,
        }),
      );
    },
    [runLogPersist],
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

let taleLoadGeneration = 0;

export function clearDeletedTale(taleId: string) {
  const state = useTaleStore.getState();
  const loadingTaleId =
    state.loadingTaleId === taleId ? null : state.loadingTaleId;

  if (state.loadingTaleId === taleId) {
    taleLoadGeneration += 1;
    useTaleStore.setState({ loadingTaleId: null });
  }
  if (state.id === taleId) {
    useTaleStore.setState({
      ...useTaleStore.getInitialState(),
      id: "",
      loadingTaleId,
    });
  }
  const lastPlayed = useLastPlayedStore.getState();
  if (lastPlayed.lastPlayedTaleId === taleId) {
    lastPlayed.setLastPlayedTaleId(null);
  }
}

export function useLoadTale() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const loadingIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);

  useEffect(
    () => () => {
      if (loadGenerationRef.current === taleLoadGeneration) {
        taleLoadGeneration += 1;
        useTaleStore.setState({ loadingTaleId: null });
      }
      loadingIdRef.current = null;
    },
    [],
  );

  const load = useCallback(async (taleId: string) => {
    if (
      loadingIdRef.current === taleId &&
      loadGenerationRef.current === taleLoadGeneration
    ) {
      return;
    }

    // All load hooks share one active tale; only the latest request may install it.
    loadingIdRef.current = taleId;
    const myToken = ++taleLoadGeneration;
    loadGenerationRef.current = myToken;
    useTaleStore.setState({ loadingTaleId: taleId });

    setLoading(true);
    setError(null);

    try {
      const tale = await getTaleById(taleId);

      if (taleLoadGeneration !== myToken) {
        return;
      }

      if (!tale) throw new Error("Tale not found");

      useTaleStore.setState({
        id: tale.id,
        loadingTaleId: null,
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
      if (taleLoadGeneration === myToken) {
        setError(e);
        throw e;
      }
    } finally {
      if (taleLoadGeneration === myToken) {
        useTaleStore.setState({ loadingTaleId: null });
      }
      if (loadGenerationRef.current === myToken) {
        setLoading(false);
        loadingIdRef.current = null;
      }
    }
  }, []);

  return { load, loading, error } as const;
}
