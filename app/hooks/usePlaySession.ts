import { useState, useCallback } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useTaleStore } from "@/store/useTaleStore";
import { useSettingsStore } from "@/store/useSettingsStore";
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
  setInput: (value: string) => void;
  action: Action;
  setAction: (action: Action) => void;
  loading: boolean;
  saving: boolean;
  handleSubmit: () => Promise<void>;
  handleContinue: () => void;
  handleRetry: () => void;
  executeLlmSend: (
    message: string,
    mode: LogEntryMode,
    append?: boolean,
  ) => Promise<void>;
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

export function usePlaySession(
  options: UsePlaySessionOptions = {},
): UsePlaySessionReturn {
  const { onSaveComplete } = options;

  const [input, setInput] = useState("");
  const [action, setAction] = useState<Action>({
    type: LogEntryMode.DO,
    isRolling: false,
  });

  const { send, loading } = useLLM();
  const { save, saving } = usePersistTale();
  const { model, randomSeed } = useSettingsStore();

  const { log, addLog, updateLogEntry, removeLastLogEntry } = useTaleStore();

  const taleId = useTaleStore((state) => state.id);

  const executeLlmSend = useCallback(
    async (message: string, mode: LogEntryMode, append = false) => {
      if (!model) {
        console.error("LLM model not configured.");
        return;
      }

      let payloadText = message;
      if (mode === LogEntryMode.CONTINUE) {
        const currentLog = useTaleStore.getState().log;
        const lastGm = [...currentLog]
          .slice()
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

      await send({ text: payloadText, mode }, model, {
        onStoryStream: (storyChunk) => {
          storyContent += storyChunk;
          updateLogEntry(gmResponseId, {
            text: storyContent,
          });
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
          console.error("LLM Error:", error);
          updateLogEntry(gmResponseId, {
            text: "An error occurred while processing your request.",
            error: error,
          });
        },
      });

      try {
        await save(taleId);
        onSaveComplete?.();
      } catch (error) {
        console.error("Failed to save tale:", error);
        toast.error("Failed to save progress");
      }
    },
    [model, addLog, updateLogEntry, save, taleId, send, onSaveComplete],
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
    if (!input.trim() || !model) return;

    const finalMessage = action.isRolling
      ? input + ` [Roll: ${Math.floor(Math.random() * 100) + 1}/100]`
      : input;
    const logMode: LogEntryMode = action.type;

    if (logMode === LogEntryMode.STORY) {
      // For "Story" Input, faux GM entry followed by continue prompt.
      const lastChainId = log.at(-1)?.chainId;
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
  }, [input, model, action, addLog, executeLlmSend, handleContinue, log]);

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
    executeLlmSend,
  };
}
