import { useTaleStore } from "@/store/useTaleStore";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLLM } from "@/hooks/useLLM";
import { useSettingsStore } from "@/store/useSettingsStore";
import { GameMode } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DicesIcon,
  HandIcon,
  SendIcon,
  SpeechIcon,
  BookIcon,
  MegaphoneIcon,
  SaveIcon,
  Loader2Icon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { nanoid } from "nanoid";
import {
  InlineEditableContent,
  LogEntryBubble,
  LogBlockBubble,
} from "@/components/game";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import { usePersistTale } from "@/hooks/useGameSaves";
import { toast } from "sonner";
interface Action {
  type: LogEntryMode;
  isRolling: boolean;
}
function getPlaceholder(action: Action) {
  let placeholder = "";
  switch (action.type) {
    case LogEntryMode.DO:
      placeholder = "You...";
      break;
    case LogEntryMode.SAY:
      placeholder = "You say...";
      break;
    case LogEntryMode.STORY:
      placeholder = "...";
      break;
    case LogEntryMode.DIRECT:
      placeholder = "Director's Note...";
      break;
  }
  if (action.isRolling) {
    placeholder += ` [With Roll]`;
  }
  return placeholder;
}

export default function Play() {
  const {
    log,
    addLog,
    modifyStat,
    addToInventory,
    removeFromInventoryByName,
    addToStats,
    updateLogEntry,
    removeLastLogEntry,
    oldestLoadedIndex,
    isLoadingOlderEntries,
    loadOlderLogEntries,
    stats,
    inventory,
    storyCards,
  } = useTaleStore();
  const [input, setInput] = useState("");
  const { send, loading } = useLLM();
  const { model, randomSeed } = useSettingsStore();
  const { gameMode, id: taleId } = useTaleStore();
  const [currentlyEditingLogId, setCurrentlyEditingLogId] = useState<
    string | null
  >(null);
  const [action, setAction] = useState<Action>({
    type: LogEntryMode.DO,
    isRolling: false,
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState<boolean>(true);
  const { save, saving } = usePersistTale();
  const hasAutoSentRef = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);

  useEffect(() => {
    if (loading) setStickToBottom(true);
  }, [loading]);

  useEffect(() => {
    setStickToBottom(true);
    // Use a small delay to ensure content is rendered
    const timer = setTimeout(() => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [taleId]);

  useEffect(() => {
    return () => {
      if (loadDebounceTimerRef.current) {
        clearTimeout(loadDebounceTimerRef.current);
      }
      if (debouncedSaveTimerRef.current) {
        clearTimeout(debouncedSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (debouncedSaveTimerRef.current) {
      clearTimeout(debouncedSaveTimerRef.current);
    }

    hasUnsavedChangesRef.current = true;

    debouncedSaveTimerRef.current = setTimeout(() => {
      save(taleId)
        .then(() => {
          hasUnsavedChangesRef.current = false;
        })
        .catch((error) => {
          console.error("Debounced save failed:", error);
          toast.error("Failed to save tale. Your changes may be lost.");
        });
    }, 2000);

    return () => {
      if (debouncedSaveTimerRef.current) {
        clearTimeout(debouncedSaveTimerRef.current);
      }
    };
  }, [log, stats, inventory, storyCards, loading, save, taleId]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth",
      block: "end",
    });
  }, [log, loading, stickToBottom]);

  const handleViewportScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;

    const thresholdPx = 64;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setStickToBottom(distanceFromBottom <= thresholdPx);

    const LOAD_THRESHOLD = 200;
    const DEBOUNCE_MS = 300;

    if (
      el.scrollTop < LOAD_THRESHOLD &&
      !loadingOlder &&
      !isLoadingOlderEntries
    ) {
      if (oldestLoadedIndex > 0) {
        if (loadDebounceTimerRef.current) {
          clearTimeout(loadDebounceTimerRef.current);
        }

        loadDebounceTimerRef.current = setTimeout(() => {
          setLoadingOlder(true);

          const scrollHeightBefore = el.scrollHeight;
          const scrollTopBefore = el.scrollTop;

          loadOlderLogEntries(50).finally(() => {
            setLoadingOlder(false);

            requestAnimationFrame(() => {
              if (viewportRef.current) {
                const scrollHeightAfter = viewportRef.current.scrollHeight;
                const heightDiff = scrollHeightAfter - scrollHeightBefore;

                viewportRef.current.scrollTop = scrollTopBefore + heightDiff;
              }
            });
          });
        }, DEBOUNCE_MS);
      }
    }
  }, [
    loadingOlder,
    oldestLoadedIndex,
    isLoadingOlderEntries,
    loadOlderLogEntries,
  ]);

  const executeLlmSend = useCallback(
    async (message: string, mode: LogEntryMode, append = false) => {
      if (!model) {
        console.error("LLM model not configsured.");
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
            text: "A strange force seems to have scrambled my thoughts. Please repeat that.",
            error: error,
          });
        },
      });
      await save(taleId);
      hasUnsavedChangesRef.current = false;
    },
    [
      model,
      addLog,
      updateLogEntry,
      modifyStat,
      addToInventory,
      removeFromInventoryByName,
      addToStats,
      save,
      taleId,
      send,
    ],
  );

  const handleContinue = useCallback(() => {
    if (loading) return;
    const lastEntry = useTaleStore.getState().log.at(-1);
    if (lastEntry?.role !== LogEntryRole.GM) return;
    updateLogEntry(lastEntry.id, {
      text: lastEntry.text + " ",
    });
    executeLlmSend("", LogEntryMode.CONTINUE, true);
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

  useEffect(() => {
    if (hasAutoSentRef.current || loading || !model) return;

    if (log.length === 1 && log[0].role === LogEntryRole.PLAYER) {
      const firstEntry = log[0];
      hasAutoSentRef.current = true;
      void executeLlmSend(
        firstEntry.text,
        firstEntry.mode ?? LogEntryMode.DIRECT,
      );
    }
  }, [log, loading, model, executeLlmSend]);

  type LogBlock = { role: LogEntryRole; chainId?: string; entries: typeof log };

  const blocks: LogBlock[] = (() => {
    const result: LogBlock[] = [];
    for (const entry of log) {
      const prev = result[result.length - 1] as LogBlock | undefined;
      const entryChain =
        entry.role === LogEntryRole.GM
          ? (entry.chainId ?? entry.id)
          : undefined;
      const prevChain = prev?.chainId;
      const canChain =
        entry.role === LogEntryRole.GM &&
        prev?.role === LogEntryRole.GM &&
        prevChain === entryChain;
      if (canChain) {
        prev.entries.push(entry);
      } else {
        result.push({
          role: entry.role,
          chainId: entryChain,
          entries: [entry],
        });
      }
    }
    return result;
  })();

  // Shared content component for both modes
  const renderMainContent = () => (
    <div className="relative grid h-full grid-rows-[1fr_auto]">
      <ScrollArea
        className="min-h-0 w-full px-2 py-0"
        viewportRef={viewportRef}
        onViewportScroll={handleViewportScroll}
        viewportClassName="!flex !flex-col"
      >
        {loadingOlder && (
          <div className="flex items-center justify-center py-2 text-muted-foreground">
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            <span className="text-sm">Loading older entries...</span>
          </div>
        )}
        {blocks.length > 0 ? (
          blocks.map((block) => (
            <div key={block.entries[0].id} className="mt-2">
              {block.role === LogEntryRole.GM ? (
                <LogBlockBubble
                  block={block}
                  onEditStart={(entryId) => setCurrentlyEditingLogId(entryId)}
                  renderEntry={(entry, onClick) =>
                    currentlyEditingLogId === entry.id ? (
                      <InlineEditableContent
                        initialValue={entry.text}
                        onCommit={(next) => {
                          updateLogEntry(entry.id, { text: next });
                          setCurrentlyEditingLogId(null);
                        }}
                        onCancel={() => setCurrentlyEditingLogId(null)}
                        variant="inline"
                        className="bg-amber-300/10 py-0.5 border-b-1 border-b-amber-700/25"
                      />
                    ) : (
                      <span className="cursor-pointer" onClick={onClick}>
                        {entry.text}
                      </span>
                    )
                  }
                />
              ) : (
                block.entries.map((entry) =>
                  currentlyEditingLogId === entry.id ? (
                    <div key={entry.id} className="bg-accent/50 rounded-md p-0">
                      <InlineEditableContent
                        initialValue={entry.text}
                        onCommit={(next) => {
                          updateLogEntry(entry.id, { text: next });
                          setCurrentlyEditingLogId(null);
                        }}
                        onCancel={() => setCurrentlyEditingLogId(null)}
                      />
                    </div>
                  ) : (
                    <div
                      key={entry.id}
                      className={`whitespace-pre-wrap hover:bg-accent/50 rounded-md cursor-pointer ${
                        currentlyEditingLogId === entry.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setCurrentlyEditingLogId(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setCurrentlyEditingLogId(entry.id);
                        }
                      }}
                    >
                      <LogEntryBubble entry={entry} />
                    </div>
                  ),
                )
              )}
            </div>
          ))
        ) : (
          <></>
        )}
        <div ref={bottomRef} className="mt-2 h-px" />
      </ScrollArea>
      <div className="pointer-events-auto z-20 w-full border-t bg-accent p-2">
        <div className="flex w-full items-end space-x-1">
          <Button
            variant={action.isRolling ? "default" : "outline"}
            size="icon"
            onClick={() =>
              setAction({
                type: action.type,
                isRolling: !action.isRolling,
              })
            }
            disabled={loading}
          >
            <DicesIcon strokeWidth={1.5} />
          </Button>

          <Select
            value={action.type}
            onValueChange={(value) =>
              setAction({
                type: value as Action["type"],
                isRolling: action.isRolling,
              })
            }
          >
            <SelectTrigger className="w-40 rounded-xs">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LogEntryMode.DO}>
                <HandIcon className="w-4 h-4 mr-2" /> Act
              </SelectItem>
              <SelectItem value={LogEntryMode.SAY}>
                <SpeechIcon className="w-4 h-4 mr-2" /> Say
              </SelectItem>
              <SelectItem value={LogEntryMode.STORY}>
                <BookIcon className="w-4 h-4 mr-2" /> Story
              </SelectItem>
              <SelectItem value={LogEntryMode.DIRECT}>
                <MegaphoneIcon className="w-4 h-4 mr-2" /> Direct
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-0">
            <div className="h-9" aria-hidden="true" />
            <Textarea
              placeholder={getPlaceholder(action)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={1}
              className="absolute inset-x-0 bottom-0 resize-none !bg-accent"
            />
          </div>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={saving || loading}
          >
            {saving ? (
              <SaveIcon className="w-4 h-4 animate-spin" />
            ) : (
              <SendIcon className="w-4 h-4" />
            )}
          </Button>
          <LogControl
            handleContinue={handleContinue}
            handleRetry={handleRetry}
            loading={loading}
            saving={saving}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0">
        <OutletWrapper />
      </div>
    </div>
  );

  return (
    <>
      {gameMode === GameMode.GM ? (
        <SidebarProvider
          defaultOpen={true}
          className="min-h-0 h-[calc(100svh-2rem)]"
        >
          <AppSidebar />
          <SidebarInset className="relative flex h-full flex-col overflow-hidden !rounded-none border-x">
            {renderMainContent()}
          </SidebarInset>
        </SidebarProvider>
      ) : (
        // Story Teller Mode - No sidebar, full width
        <div className="relative flex h-[calc(100svh-2rem)] flex-col overflow-hidden">
          {renderMainContent()}
        </div>
      )}
    </>
  );
}

// Lightweight wrapper that renders nested outlet without affecting layout; defined here to avoid imports
import { Outlet } from "@tanstack/react-router";
import { LogControl } from "@/components/game/log-control";
function OutletWrapper() {
  return <Outlet />;
}
