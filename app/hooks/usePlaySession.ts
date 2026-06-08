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
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
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
  handleStop: () => void;
  executeLlmSend: (
    message: string,
    mode: LogEntryMode,
    append?: boolean,
  ) => Promise<void>;
}

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
  const { save, saving } = usePersistTale();
  const narratorConfig = useSettingsStore((state) => state.modelRoles.narrator);
  const randomSeed = useSettingsStore((state) => state.randomSeed);

  const { addLog, updateLogEntry, removeLastLogEntry } = useTaleStore();

  const taleId = useTaleStore((state) => state.id);

  const handleStop = useCallback(() => {
    if (!loading) return;
    cancel();
  }, [cancel, loading]);

  const executeLlmSend = useCallback(
    async (message: string, mode: LogEntryMode, append = false) => {
      if (!isModelRoleConfigured(narratorConfig)) {
        console.error("Narrator model not configured.");
        toast.error("No narrator model selected. Choose one in Settings.");
        return;
      }

      let payloadText = message;
      if (mode === LogEntryMode.CONTINUE) {
        const currentLog = useTaleStore.getState().log;
        const lastGm = [...currentLog]
          .reverse()
          .find((e) => e.role === LogEntryRole.GM);
        if (!lastGm) {
          console.error("No GM entry to continue.");
          return;
        }
        payloadText = lastGm.text;
      }

      let gmResponseId: string;
      if (append) {
        const lastEntry = useTaleStore.getState().log.at(-1);
        if (!lastEntry || lastEntry.role !== LogEntryRole.GM) {
          console.error("No GM entry to continue.");
          return;
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
        await send(
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

      try {
        await save(taleId);
        onSaveComplete?.();
      } catch (error) {
        console.error("Failed to save tale:", error);
        toast.error("Failed to save progress");
      }
    },
    [
      narratorConfig,
      addLog,
      updateLogEntry,
      save,
      taleId,
      send,
      onSaveComplete,
    ],
  );

  const handleContinue = useCallback(() => {
    if (loading) return;
    const lastEntry = useTaleStore.getState().log.at(-1);
    if (lastEntry?.role !== LogEntryRole.GM) return;
    updateLogEntry(lastEntry.id, {
      text: lastEntry.text + " ",
    });
    void executeLlmSend("", LogEntryMode.CONTINUE, true);
  }, [loading, executeLlmSend, updateLogEntry]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    if (loading) return;
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
      const lastChainId = useTaleStore.getState().log.at(-1)?.chainId;
      addLog({
        id: nanoid(),
        role: LogEntryRole.GM,
        text: "\n\n" + finalMessage,
        mode: LogEntryMode.STORY,
        chainId: lastChainId,
      });
      setInput("");
      handleContinue();
    } else {
      addLog({
        id: nanoid(),
        role: LogEntryRole.PLAYER,
        text: finalMessage,
        mode: logMode,
      });
      setInput("");
      void executeLlmSend(finalMessage, logMode);
    }
  }, [
    input,
    narratorConfig,
    loading,
    action,
    addLog,
    executeLlmSend,
    handleContinue,
  ]);

  const handleRetry = useCallback(() => {
    if (loading) return;
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
      void executeLlmSend("", LogEntryMode.CONTINUE, true);
      return;
    }
    if (prevEntry?.role === LogEntryRole.PLAYER) {
      removeLastLogEntry();
      void executeLlmSend(prevEntry.text, prevEntry.mode ?? LogEntryMode.STORY);
      return;
    }
    console.warn("Cannot retry, log state is not as expected.");
  }, [loading, executeLlmSend, removeLastLogEntry, randomSeed]);

  const handleUndo = useCallback(() => {
    if (loading || saving) return;

    const lastEntry = useTaleStore.getState().log.at(-1);
    if (!lastEntry) return;

    useTaleStore.getState().undo();

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
  }, [loading, saving]);

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
    handleStop,
    executeLlmSend,
  };
}
