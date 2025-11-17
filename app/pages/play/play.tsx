import { useTaleStore } from "@/store/useTaleStore";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout";
import { MobilePlayHeader } from "@/components/layout/mobile-play-header";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLLM } from "@/hooks/useLLM";
import { useSettingsStore } from "@/store/useSettingsStore";
import { GameMode } from "@/types";
import { nanoid } from "nanoid";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import { usePersistTale } from "@/hooks/useGameSaves";
import { toast } from "sonner";
import { PlayInputControls, PlayLogDisplay } from "@/components/play";
import { Action, groupLogEntriesIntoBlocks } from "@/lib/play-utils";
import { Outlet } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/useIsMobile";

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
  const { model, randomSeed, fontSize, setFontSize } = useSettingsStore();
  const { gameMode, id: taleId } = useTaleStore();
  const { isMobilePlatform } = useIsMobile();
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
  const lastTaleIdRef = useRef(taleId);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const zoomIndicatorTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (loading) setStickToBottom(true);
  }, [loading]);

  // On new tales.
  useEffect(() => {
    // Reset auto-send flag
    if (lastTaleIdRef.current !== taleId) {
      hasAutoSentRef.current = false;
      lastTaleIdRef.current = taleId;
    }

    // Scroll to bottom
    setStickToBottom(true);
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
      if (zoomIndicatorTimerRef.current) {
        clearTimeout(zoomIndicatorTimerRef.current);
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

  const showZoomIndicatorTemporarily = useCallback(() => {
    setShowZoomIndicator(true);
    if (zoomIndicatorTimerRef.current) {
      clearTimeout(zoomIndicatorTimerRef.current);
    }
    zoomIndicatorTimerRef.current = setTimeout(() => {
      setShowZoomIndicator(false);
    }, 1500);
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setFontSize(fontSize + delta);
        showZoomIndicatorTemporarily();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          setFontSize(fontSize + 0.1);
          showZoomIndicatorTemporarily();
        } else if (e.key === "-") {
          e.preventDefault();
          setFontSize(fontSize - 0.1);
          showZoomIndicatorTemporarily();
        } else if (e.key === "0") {
          e.preventDefault();
          setFontSize(1);
          showZoomIndicatorTemporarily();
        }
      }
    };

    globalThis.addEventListener("wheel", handleWheel, { passive: false });
    globalThis.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.removeEventListener("wheel", handleWheel);
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [fontSize, setFontSize, showZoomIndicatorTemporarily]);

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
            text: "An error occured while processing your request.",
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

  const blocks = groupLogEntriesIntoBlocks(log);

  // Shared content component for both modes
  const renderMainContent = () => (
    <div className="relative grid h-full grid-rows-[1fr_auto]">
      <PlayLogDisplay
        blocks={blocks}
        loadingOlder={loadingOlder}
        currentlyEditingLogId={currentlyEditingLogId}
        setCurrentlyEditingLogId={setCurrentlyEditingLogId}
        updateLogEntry={updateLogEntry}
        viewportRef={viewportRef}
        bottomRef={bottomRef}
        onViewportScroll={handleViewportScroll}
      />
      <PlayInputControls
        action={action}
        setAction={setAction}
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        loading={loading}
        saving={saving}
        onContinue={handleContinue}
        onRetry={handleRetry}
      />
      {showZoomIndicator && (
        <div className="pointer-events-none absolute top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="rounded-md bg-background/95 px-4 py-2 shadow-lg border border-border backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-muted-foreground">Zoom:</span>
              <span className="font-mono">{Math.round(fontSize * 100)}%</span>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0">
        <OutletWrapper />
      </div>
    </div>
  );

  return (
    <>
      <MobilePlayHeader />
      {gameMode === GameMode.GM ? (
        <SidebarProvider
          defaultOpen={true}
          className="min-h-0 h-full"
          style={
            isMobilePlatform
              ? { height: "100svh" }
              : { height: "calc(100vh - 2rem)" }
          }
        >
          <AppSidebar
            style={
              isMobilePlatform
                ? { paddingLeft: "env(safe-area-inset-left)" }
                : undefined
            }
          />
          <SidebarInset
            className="relative flex h-full flex-col overflow-hidden !rounded-none border-x"
            style={
              isMobilePlatform
                ? { paddingRight: "env(safe-area-inset-right)" }
                : undefined
            }
          >
            {renderMainContent()}
          </SidebarInset>
        </SidebarProvider>
      ) : (
        // Story Teller Mode - No sidebar, full width
        <div
          className="relative flex flex-col overflow-hidden h-full"
          style={
            isMobilePlatform
              ? {
                  height: "100svh",
                  paddingLeft: "env(safe-area-inset-left)",
                  paddingRight: "env(safe-area-inset-right)",
                }
              : { height: "calc(100vh - 2rem)" }
          }
        >
          {renderMainContent()}
        </div>
      )}
    </>
  );
}

// Lightweight wrapper that renders nested outlet
function OutletWrapper() {
  return <Outlet />;
}
