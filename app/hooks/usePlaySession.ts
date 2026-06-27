import {
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useTaleStore } from "@/store/useTaleStore";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useLLM } from "@/hooks/useLLM";
import { usePersistTale } from "@/hooks/useGameSaves";
import { LogEntry, LogEntryMode, LogEntryRole } from "@/types/log.type";
import { LLMAction } from "@/services/llm/schema";
import { Action } from "@/lib/play-utils";

interface UsePlaySessionOptions {
  onSaveComplete?: () => void;
}

interface UsePlaySessionReturn {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  action: Action;
  setAction: (action: Action) => void;
  loading: boolean;
  saving: boolean;
  handleSubmit: () => Promise<void>;
  handleContinue: () => void;
  handleRetry: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleStop: () => void;
  executeLlmSend: (
    message: string,
    mode: LogEntryMode,
    options?: ExecuteLlmSendOptions,
  ) => Promise<LogEntry | null>;
}

type ExecuteLlmSendOptions = {
  continueChain?: boolean;
  persistence?: GenerationPersistence;
};

type GenerationPersistence =
  | {
      type: "new-turn";
      pendingEntries: LogEntry[];
      leadingEntries?: LogEntry[];
      fallbackToAppend?: boolean;
      cancelEntryCount?: number;
    }
  | { type: "continuation"; leadingEntries?: LogEntry[] }
  | {
      type: "retry-turn";
      previousEntries: LogEntry[];
      leadingEntries?: LogEntry[];
    }
  | { type: "retry-entry"; previousEntry: LogEntry };

function isAbortError(error: unknown): boolean {
  if (!error) return false;

  const toString = (val: unknown): string =>
    typeof val === "string" ? val : "";

  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    const text = `${error.name} ${error.message}`.toLowerCase();
    return text.includes("abort") || text.includes("cancel");
  }

  if (typeof error === "string") {
    const text = error.toLowerCase();
    return text.includes("abort") || text.includes("cancel");
  }

  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const text =
      `${toString(obj.name)} ${toString(obj.message)} ${toString(obj.code)}`.toLowerCase();
    return (
      obj.name === "AbortError" ||
      text.includes("abort") ||
      text.includes("cancel")
    );
  }

  return false;
}

/**
 * Processes LLM actions and applies them to the tale store
 */
function processActions(actions: LLMAction[]): void {
  const { modifyStat, addToInventory, removeFromInventoryByName, addToStats } =
    useTaleStore.getState();

  for (const action of actions) {
    switch (action.type) {
      case "MODIFY_STAT": {
        const name = action.payload.name;
        const value = action.payload.value;
        if (name && typeof value === "number") {
          modifyStat(name, value);
        }
        break;
      }
      case "ADD_TO_INVENTORY": {
        const item = action.payload.item;
        if (typeof item === "string" && item.length > 0) {
          addToInventory(item);
        }
        break;
      }
      case "REMOVE_FROM_INVENTORY": {
        const item = action.payload.item;
        if (typeof item === "string" && item.length > 0) {
          removeFromInventoryByName(item);
        }
        break;
      }
      case "ADD_TO_STATS": {
        const name = action.payload.name;
        const value = action.payload.value;
        if (name && typeof value === "number") {
          addToStats({
            name,
            value,
            range: [0, 100],
          });
        }
        break;
      }
      default:
        console.warn("Unknown action type:", action.type);
    }
  }
}

type RestorableActionMode =
  | LogEntryMode.DO
  | LogEntryMode.SAY
  | LogEntryMode.DIRECT;

function isRestorableActionMode(
  mode?: LogEntryMode,
): mode is RestorableActionMode {
  return (
    mode === LogEntryMode.DO ||
    mode === LogEntryMode.SAY ||
    mode === LogEntryMode.DIRECT
  );
}

function hasVisibleGeneratedText(entry: LogEntry | null | undefined): boolean {
  return Boolean(entry?.text.trim());
}

type GenerationPersistenceActions = {
  taleId: string;
  getLog: () => LogEntry[];
  removeGeneratedPlaceholder: () => void;
  removeTrailingEntries: (entries?: LogEntry[]) => void;
  restoreLogEntry: (entry: LogEntry) => void;
  saveTurn: (
    taleId: string,
    entries: LogEntry[],
    createdAt?: number,
  ) => Promise<void>;
  completePendingTurn: (
    taleId: string,
    pendingEntries: LogEntry[],
    entries: LogEntry[],
    createdAt?: number,
    fallbackToAppend?: boolean,
  ) => Promise<void>;
  retryTurn: (
    taleId: string,
    previousEntries: LogEntry[],
    entries: LogEntry[],
    createdAt?: number,
  ) => Promise<void>;
  retryEntry: (
    taleId: string,
    previousEntry: LogEntry,
    replacementEntry: LogEntry,
  ) => Promise<void>;
  undoToEntryCount: (taleId: string, entryCount?: number) => Promise<void>;
};

async function persistGeneratedResponse({
  persistence,
  finalGmEntry,
  sendAborted,
  actions,
}: {
  persistence: GenerationPersistence;
  finalGmEntry: LogEntry | null;
  sendAborted: boolean;
  actions: GenerationPersistenceActions;
}): Promise<"saved" | "cancelled" | "missing"> {
  if (sendAborted && !hasVisibleGeneratedText(finalGmEntry)) {
    actions.removeGeneratedPlaceholder();

    if (persistence.type === "new-turn") {
      if (persistence.cancelEntryCount !== undefined) {
        actions.removeTrailingEntries(
          persistence.leadingEntries ?? persistence.pendingEntries,
        );
        await actions.undoToEntryCount(
          actions.taleId,
          persistence.cancelEntryCount,
        );
      }
      return "cancelled";
    }

    if (persistence.type === "continuation") {
      actions.removeTrailingEntries(persistence.leadingEntries);
      return "cancelled";
    }

    if (persistence.type === "retry-turn") {
      const restoredEntry = persistence.previousEntries.at(-1);
      if (restoredEntry) actions.restoreLogEntry(restoredEntry);
      return "cancelled";
    }

    actions.restoreLogEntry(persistence.previousEntry);
    return "cancelled";
  }

  if (!finalGmEntry) return "missing";

  const latestLog = actions.getLog();
  const resolveEntries = (entries: LogEntry[] = []) =>
    entries.map(
      (candidate) =>
        latestLog.find((logEntry) => logEntry.id === candidate.id) ?? candidate,
    );

  if (persistence.type === "new-turn") {
    const pendingEntries = resolveEntries(persistence.pendingEntries);
    const leadingEntries = resolveEntries(
      persistence.leadingEntries ?? persistence.pendingEntries,
    );
    await actions.completePendingTurn(
      actions.taleId,
      pendingEntries,
      [...leadingEntries, finalGmEntry],
      Date.now(),
      persistence.fallbackToAppend ?? false,
    );
    return "saved";
  }

  if (persistence.type === "continuation") {
    await actions.saveTurn(actions.taleId, [
      ...resolveEntries(persistence.leadingEntries),
      finalGmEntry,
    ]);
    return "saved";
  }

  if (persistence.type === "retry-turn") {
    await actions.retryTurn(
      actions.taleId,
      resolveEntries(persistence.previousEntries),
      [...resolveEntries(persistence.leadingEntries), finalGmEntry],
    );
    return "saved";
  }

  await actions.retryEntry(
    actions.taleId,
    persistence.previousEntry,
    finalGmEntry,
  );
  return "saved";
}

export function usePlaySession(
  options: UsePlaySessionOptions = {},
): UsePlaySessionReturn {
  const { onSaveComplete } = options;

  const [input, setInput] = useState("");
  const [action, setAction] = useState<Action>({
    type: LogEntryMode.DO,
    isRolling: false,
  });

  const { send, loading, cancel } = useLLM();
  const {
    saveTurn,
    completePendingTurn,
    retryTurn,
    editEntry,
    retryEntry,
    undoToEntryCount,
    redoEntry,
    saving,
  } = usePersistTale();
  const narratorConfig = useSettingsStore((state) => state.modelRoles.narrator);
  const randomSeed = useSettingsStore((state) => state.randomSeed);

  const { addLog, updateLogEntry, removeLastLogEntry, restoreLogEntry } =
    useTaleStore();

  const taleId = useTaleStore((state) => state.id);

  const handleStop = useCallback(() => {
    if (!loading) return;
    cancel();
  }, [cancel, loading]);

  const removeTrailingEntries = useCallback(
    (entries: LogEntry[] = []) => {
      for (const entry of [...entries].reverse()) {
        if (useTaleStore.getState().log.at(-1)?.id !== entry.id) continue;
        removeLastLogEntry();
      }
    },
    [removeLastLogEntry],
  );

  const executeLlmSend = useCallback(
    async (
      message: string,
      mode: LogEntryMode,
      options: ExecuteLlmSendOptions = {},
    ) => {
      if (!isModelRoleConfigured(narratorConfig)) {
        console.error("Narrator model not configured.");
        toast.error("No narrator model selected. Choose one in Settings.");
        return null;
      }

      const continueChain = options.continueChain ?? false;
      let payloadText = message;
      if (mode === LogEntryMode.CONTINUE) {
        const currentLog = useTaleStore.getState().log;
        const lastGm = [...currentLog]
          .reverse()
          .find((e) => e.role === LogEntryRole.GM);
        if (!lastGm) {
          console.error("No GM entry to continue.");
          return null;
        }
        payloadText = lastGm.text;
      }

      let gmResponseId: string;
      if (continueChain) {
        const lastEntry = useTaleStore.getState().log.at(-1);
        if (!lastEntry || lastEntry.role !== LogEntryRole.GM) {
          console.error("No GM entry to continue.");
          return null;
        }
        const chainId = lastEntry.chainId ?? lastEntry.id;
        gmResponseId = nanoid();
        addLog({
          id: gmResponseId,
          role: LogEntryRole.GM,
          text: "",
          mode: LogEntryMode.STORY,
          chainId,
        });
      } else {
        gmResponseId = nanoid();
        addLog({
          id: gmResponseId,
          role: LogEntryRole.GM,
          text: "",
          mode: LogEntryMode.STORY,
          chainId: gmResponseId,
        });
      }

      let storyContent = "";
      let thinkingContent = "";
      let rafId: number | null = null;
      let sendError: unknown = null;
      let sendAborted = false;
      const flushResponse = () => {
        rafId = null;
        updateLogEntry(gmResponseId, {
          ...(storyContent.length > 0 ? { text: storyContent } : {}),
          ...(thinkingContent ? { thinking: thinkingContent } : {}),
        });
      };
      const scheduleFlush = () => {
        if (rafId !== null) return;
        const raf = globalThis.requestAnimationFrame;
        if (typeof raf === "function") {
          rafId = raf(() => flushResponse());
        } else {
          // Fallback (non-browser/test env)
          flushResponse();
        }
      };

      try {
        const sendResult = await send(
          { text: payloadText, mode },
          {
            onStoryStream: (storyChunk) => {
              storyContent += storyChunk;
              scheduleFlush();
            },
            onThinkingStream: (thinkingChunk) => {
              thinkingContent += thinkingChunk;
              scheduleFlush();
            },
            onActionsReady: (actions) => {
              console.debug(
                `Processing received actions: ${JSON.stringify(actions)}`,
              );
              if (Array.isArray(actions)) {
                updateLogEntry(gmResponseId, { actions });
                processActions(actions);
              }
            },
            onActionParseError: () => {
              console.warn("Failed to parse actions from LLM response");
              updateLogEntry(gmResponseId, {
                isActionError: true,
              });
            },
            onError: (error) => {
              // Keep any partial text that streamed already.
              if (isAbortError(error)) return;
              console.error("LLM Error:", error);
              updateLogEntry(gmResponseId, {
                error: error,
                ...(thinkingContent ? { thinking: thinkingContent } : {}),
                ...(storyContent.length === 0
                  ? { text: "An error occurred while processing your request." }
                  : {}),
              });
            },
          },
        );
        if (sendResult.status === "aborted") {
          sendAborted = true;
          sendError = sendResult.error;
        } else if (sendResult.status === "error") {
          sendError = sendResult.error;
        }
      } catch (error) {
        sendError = error;
        if (isAbortError(error)) {
          sendAborted = true;
        }
        if (!isAbortError(error)) {
          console.error("LLM Error:", error);
          updateLogEntry(gmResponseId, {
            error,
            ...(thinkingContent ? { thinking: thinkingContent } : {}),
            ...(storyContent.length === 0
              ? { text: "An error occurred while processing your request." }
              : {}),
          });
        }
      } finally {
        if (rafId !== null) {
          const cancelRaf = globalThis.cancelAnimationFrame;
          if (typeof cancelRaf === "function") cancelRaf(rafId);
          rafId = null;
          if (storyContent.length > 0 || thinkingContent.length > 0) {
            updateLogEntry(gmResponseId, {
              ...(storyContent.length > 0 ? { text: storyContent } : {}),
              ...(thinkingContent ? { thinking: thinkingContent } : {}),
            });
          }
        }
      }

      const persistence: GenerationPersistence = options.persistence ?? {
        type: "continuation",
      };
      const currentLog = useTaleStore.getState().log;
      const finalGmEntry =
        currentLog.find((entry) => entry.id === gmResponseId) ?? null;
      const removeGeneratedPlaceholder = () => {
        const currentLog = useTaleStore.getState().log;
        if (currentLog.at(-1)?.id === gmResponseId) {
          removeLastLogEntry();
        }
      };
      const isEmptyAbort =
        sendAborted && !hasVisibleGeneratedText(finalGmEntry);

      try {
        const result = await persistGeneratedResponse({
          persistence,
          finalGmEntry,
          sendAborted,
          actions: {
            taleId,
            getLog: () => useTaleStore.getState().log,
            removeGeneratedPlaceholder,
            removeTrailingEntries,
            restoreLogEntry,
            saveTurn,
            completePendingTurn,
            retryTurn,
            retryEntry,
            undoToEntryCount,
          },
        });
        if (result === "cancelled") return null;
        if (result === "missing") return null;
        onSaveComplete?.();
      } catch (error) {
        console.error(
          isEmptyAbort
            ? "Failed to cancel aborted tale generation:"
            : "Failed to save tale:",
          error,
        );
        toast.error("Failed to save progress");
        if (isEmptyAbort) return null;
      }

      if (sendError && !isAbortError(sendError)) {
        return finalGmEntry;
      }
      return finalGmEntry;
    },
    [
      narratorConfig,
      addLog,
      updateLogEntry,
      removeLastLogEntry,
      restoreLogEntry,
      saveTurn,
      completePendingTurn,
      retryTurn,
      retryEntry,
      undoToEntryCount,
      removeTrailingEntries,
      taleId,
      send,
      onSaveComplete,
    ],
  );

  const handleContinue = useCallback(() => {
    if (loading || saving) return;
    const lastEntry = useTaleStore.getState().log.at(-1);
    if (lastEntry?.role !== LogEntryRole.GM) return;
    const nextText = lastEntry.text + " ";
    updateLogEntry(lastEntry.id, {
      text: nextText,
    });
    void editEntry(taleId, lastEntry.id, { text: nextText }).catch((error) => {
      console.error("Failed to save edited log entry:", error);
      toast.error("Failed to save progress");
    });
    void executeLlmSend("", LogEntryMode.CONTINUE, {
      continueChain: true,
      persistence: { type: "continuation" },
    });
  }, [loading, saving, executeLlmSend, editEntry, taleId, updateLogEntry]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    if (loading || saving) return;
    if (!isModelRoleConfigured(narratorConfig)) {
      toast.error("No narrator model selected. Choose one in Settings.");
      return;
    }

    const finalMessage = action.isRolling
      ? input + ` [Roll: ${Math.floor(Math.random() * 100) + 1}/100]`
      : input;
    const logMode: LogEntryMode = action.type;

    if (logMode === LogEntryMode.STORY) {
      // For "Story" Input, faux GM entry followed by continue prompt.
      const previousLogCount = useTaleStore.getState().totalLogCount;
      const lastChainId = useTaleStore.getState().log.at(-1)?.chainId;
      const storyEntry: LogEntry = {
        id: nanoid(),
        role: LogEntryRole.GM,
        text: "\n\n" + finalMessage + " ",
        mode: LogEntryMode.STORY,
        chainId: lastChainId,
      };
      addLog(storyEntry);
      setInput("");
      try {
        await saveTurn(taleId, [storyEntry]);
      } catch (error) {
        console.error("Failed to save pending story entry:", error);
        removeTrailingEntries([storyEntry]);
        setInput(input);
        toast.error("Failed to save progress");
        return;
      }
      void executeLlmSend("", LogEntryMode.CONTINUE, {
        continueChain: true,
        persistence: {
          type: "new-turn",
          pendingEntries: [storyEntry],
          leadingEntries: [storyEntry],
          cancelEntryCount: previousLogCount,
        },
      });
    } else {
      const previousLogCount = useTaleStore.getState().totalLogCount;
      const playerEntry: LogEntry = {
        id: nanoid(),
        role: LogEntryRole.PLAYER,
        text: finalMessage,
        mode: logMode,
      };
      addLog(playerEntry);
      setInput("");
      try {
        await saveTurn(taleId, [playerEntry]);
      } catch (error) {
        console.error("Failed to save pending player entry:", error);
        removeTrailingEntries([playerEntry]);
        setInput(input);
        toast.error("Failed to save progress");
        return;
      }
      void executeLlmSend(finalMessage, logMode, {
        persistence: {
          type: "new-turn",
          pendingEntries: [playerEntry],
          leadingEntries: [playerEntry],
          cancelEntryCount: previousLogCount,
        },
      });
    }
  }, [
    input,
    narratorConfig,
    loading,
    saving,
    action,
    addLog,
    saveTurn,
    executeLlmSend,
    removeTrailingEntries,
    taleId,
  ]);

  const handleRetry = useCallback(() => {
    if (loading || saving) return;
    randomSeed();

    const stateLog = useTaleStore.getState().log;
    const lastEntry = stateLog.at(-1);
    if (lastEntry?.role !== LogEntryRole.GM) {
      console.warn("Cannot retry, last entry is not GM.");
      return;
    }
    const prevEntry = stateLog.at(-2);
    if (
      prevEntry?.role === LogEntryRole.GM &&
      (prevEntry.chainId ?? prevEntry.id) ===
        (lastEntry.chainId ?? lastEntry.id)
    ) {
      removeLastLogEntry();
      void executeLlmSend("", LogEntryMode.CONTINUE, {
        continueChain: true,
        persistence: { type: "retry-entry", previousEntry: lastEntry },
      });
      return;
    }
    if (prevEntry?.role === LogEntryRole.PLAYER) {
      removeLastLogEntry();
      void executeLlmSend(
        prevEntry.text,
        prevEntry.mode ?? LogEntryMode.STORY,
        {
          persistence: {
            type: "retry-turn",
            previousEntries: [prevEntry, lastEntry],
            leadingEntries: [prevEntry],
          },
        },
      );
      return;
    }
    console.warn("Cannot retry, log state is not as expected.");
  }, [loading, saving, executeLlmSend, removeLastLogEntry, randomSeed]);

  const handleUndo = useCallback(() => {
    if (loading || saving) return;

    const lastEntry = useTaleStore.getState().log.at(-1);
    if (!lastEntry) return;

    useTaleStore.getState().undo();
    void undoToEntryCount(taleId).catch((error) => {
      console.error("Failed to save undo:", error);
      toast.error("Failed to save progress");
    });

    if (lastEntry.role !== LogEntryRole.PLAYER) {
      setInput("");
      return;
    }

    setInput(lastEntry.text);

    const restoredMode = lastEntry.mode;
    if (isRestorableActionMode(restoredMode)) {
      setAction((currentAction) => ({
        ...currentAction,
        type: restoredMode,
      }));
    }
  }, [loading, saving, taleId, undoToEntryCount]);

  const handleRedo = useCallback(() => {
    if (loading || saving) return;

    const lastUndone = useTaleStore.getState().undoStack.at(-1);
    if (!lastUndone) return;

    useTaleStore.getState().redo();
    void redoEntry(taleId, lastUndone).catch((error) => {
      console.error("Failed to save redo:", error);
      toast.error("Failed to save progress");
    });
  }, [redoEntry, loading, saving, taleId]);

  return {
    input,
    setInput,
    action,
    setAction,
    loading,
    saving,
    handleSubmit,
    handleContinue,
    handleRetry,
    handleUndo,
    handleRedo,
    handleStop,
    executeLlmSend,
  };
}
