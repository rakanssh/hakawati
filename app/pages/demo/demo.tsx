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
  SquareIcon,
  MegaphoneIcon,
  SaveIcon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
// tooltips currently unused here after block refactor
import { nanoid } from "nanoid";
import {
  InlineEditableContent,
  LogEntryBubble,
  LogBlockBubble,
} from "@/components/game";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import { usePersistTale } from "@/hooks/useGameSaves";
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

export default function Demo() {
  const {
    log,
    addLog,
    modifyStat,
    addToInventory,
    removeFromInventoryByName,
    addToStats,
    updateLogEntry,
    removeLastLogEntry,
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
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState<number>(80);
  const { save, saving } = usePersistTale();

  useEffect(() => {
    if (loading) setStickToBottom(true);
  }, [loading]);

  useEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth",
      block: "end",
    });
  }, [log, loading, stickToBottom]);

  //fix bottom bar height
  useEffect(() => {
    const el = bottomBarRef.current;
    if (!el) return;
    const update = () => setBottomBarHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const handleViewportScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    const thresholdPx = 64;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setStickToBottom(distanceFromBottom <= thresholdPx);
  };

  const executeLlmSend = useCallback(
    async (message: string, mode: LogEntryMode, append = false) => {
      if (!model) {
        console.error("LLM model not configured.");
        return;
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

      await send({ text: message, mode }, model, {
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
          const entry = useTaleStore
            .getState()
            .log.find((e) => e.id === gmResponseId);
          updateLogEntry(gmResponseId, {
            actions: [...(entry?.actions || []), ...actions],
            isActionError: false,
          });
          // Only process actions that affect game state in GM mode
          if (gameMode === GameMode.GM && Array.isArray(actions)) {
            for (const action of actions) {
              switch (action.type) {
                case "MODIFY_STAT":
                  if (action.payload.name && action.payload.value) {
                    modifyStat(action.payload.name, action.payload.value);
                  }
                  break;
                case "ADD_TO_INVENTORY":
                  if (action.payload.item) {
                    addToInventory(action.payload.item);
                  }
                  break;
                case "REMOVE_FROM_INVENTORY":
                  if (action.payload.item) {
                    removeFromInventoryByName(action.payload.item);
                  }
                  break;
                case "ADD_TO_STATS":
                  if (action.payload.name && action.payload.value) {
                    addToStats({
                      name: action.payload.name,
                      value: action.payload.value,
                      range: [0, 100],
                    });
                  }
                  break;
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
          });
        },
      });
      await save(taleId);
    },
    [
      model,
      addLog,
      updateLogEntry,
      gameMode,
      modifyStat,
      addToInventory,
      removeFromInventoryByName,
      addToStats,
      save,
      taleId,
      send,
    ],
  );

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || !model) return;

    const finalMessage = action.isRolling
      ? input + ` [Roll: ${Math.floor(Math.random() * 100) + 1}/100]`
      : input;
    const logMode: LogEntryMode = action.type;

    addLog({
      id: nanoid(),
      role: LogEntryRole.PLAYER,
      text: finalMessage,
      mode: logMode,
    });
    setInput("");
    void executeLlmSend(finalMessage, logMode);
  }, [input, model, action, addLog, executeLlmSend]);

  const handleRetry = () => {
    if (loading) return;
    randomSeed();

    const lastEntry = log.at(-1);
    if (lastEntry?.role !== LogEntryRole.GM) {
      console.warn("Cannot retry, last entry is not GM.");
      return;
    }
    const prevEntry = log.at(-2);
    if (
      prevEntry?.role === LogEntryRole.GM &&
      (prevEntry.chainId ?? prevEntry.id) ===
        (lastEntry.chainId ?? lastEntry.id)
    ) {
      removeLastLogEntry();
      executeLlmSend("Continue", LogEntryMode.STORY, true);
      return;
    }
    if (prevEntry?.role === LogEntryRole.PLAYER) {
      removeLastLogEntry();
      executeLlmSend(prevEntry.text, prevEntry.mode ?? LogEntryMode.STORY);
      return;
    }
    console.warn("Cannot retry, log state is not as expected.");
  };

  const handleContinue = () => {
    if (loading) return;
    const lastEntry = log.at(-1);
    if (lastEntry?.role !== LogEntryRole.GM) return;
    executeLlmSend("Continue", LogEntryMode.STORY, true);
  };

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
    <>
      <ScrollArea
        className="flex-1 px-2 py-0 min-h-0"
        viewportRef={viewportRef}
        onViewportScroll={handleViewportScroll}
      >
        {blocks.length > 0 ? (
          blocks.map((block) => (
            <div key={block.entries[0].id} className="mt-2">
              {block.role === LogEntryRole.GM ? (
                <LogBlockBubble
                  block={block}
                  onEditStart={(entryId) => setCurrentlyEditingLogId(entryId)}
                  renderEntry={(entry, onClick) =>
                    currentlyEditingLogId === entry.id ? (
                      <div className="bg-accent/50 rounded-md p-0">
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
        <div
          ref={bottomRef}
          className="mt-2"
          style={{ height: bottomBarHeight + 8 }}
        />
      </ScrollArea>
      <div
        ref={bottomBarRef}
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 border-t bg-accent p-2"
      >
        <div className="flex w-full items-end space-x-1">
          <Button
            variant={action.isRolling ? "default" : "outline"}
            className="rounded-xs"
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
              className="absolute inset-x-0 bottom-0 resize-none rounded-xs !bg-accent"
            />
          </div>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-xs"
          >
            {loading ? (
              <SquareIcon className="w-4 h-4 animate-pulse" />
            ) : saving ? (
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
    </>
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
