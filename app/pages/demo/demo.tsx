import { useGameStore } from "@/store/useGameStore";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLLM } from "@/hooks/useLLM";
import { useSettingsStore } from "@/store/useSettingsStore";
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
  MessageCircleWarning,
  RefreshCwIcon,
  SendIcon,
  SpeechIcon,
  BookIcon,
  SquareIcon,
  MegaphoneIcon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { nanoid } from "nanoid";
import { InlineEditableContent, LogEntryBubble } from "@/components/game";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
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
  } = useGameStore();
  const [input, setInput] = useState("");
  const { send, loading } = useLLM();
  const { model, randomSeed } = useSettingsStore();
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

  useEffect(() => {
    if (loading) setStickToBottom(true);
  }, [loading]);

  useEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth",
      block: "end",
    });
  }, [log]);

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

  const executeLlmSend = (message: string) => {
    if (!model) {
      console.error("LLM model not configured.");
      return;
    }
    const gmResponseId = nanoid();
    addLog({
      id: gmResponseId,
      role: LogEntryRole.GM,
      text: "...",
      mode: LogEntryMode.STORY,
    });

    let storyContent = "";

    send(message, model, {
      onStoryStream: (storyChunk) => {
        storyContent += storyChunk;
        updateLogEntry(gmResponseId, {
          text: storyContent,
        });
      },
      onActionsReady: (actions) => {
        console.debug(
          `Processing received actions: ${JSON.stringify(actions)}`
        );
        if (Array.isArray(actions)) {
          updateLogEntry(gmResponseId, { actions });
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
        updateLogEntry(gmResponseId, { isActionError: true });
      },
      onError: (error) => {
        console.error("LLM Error:", error);
        updateLogEntry(gmResponseId, {
          text: "A strange force seems to have scrambled my thoughts. Please repeat that.",
        });
      },
    });
  };

  const handleSubmit = async () => {
    if (!input.trim() || !model) return;

    const playerInput = action.isRolling
      ? input + ` [Roll: ${Math.floor(Math.random() * 100) + 1}/100]`
      : input;

    const finalMessage = playerInput;

    addLog({
      id: nanoid(),
      role: LogEntryRole.PLAYER,
      text: finalMessage,
      mode: action.type,
    });
    setInput("");
    executeLlmSend(finalMessage);
  };

  const handleRetry = () => {
    if (loading) return;
    randomSeed();

    const lastEntry = log.at(-1);
    const secondLastEntry = log.at(-2);

    if (
      lastEntry?.role === LogEntryRole.GM &&
      secondLastEntry?.role === LogEntryRole.PLAYER
    ) {
      removeLastLogEntry();
      executeLlmSend(secondLastEntry.text);
    } else {
      console.warn("Cannot retry, log state is not as expected.");
    }
  };

  return (
    <SidebarProvider
      defaultOpen={true}
      className="min-h-0 h-[calc(100svh-2rem)]"
    >
      <AppSidebar />
      <SidebarInset className="relative flex h-full flex-col overflow-hidden">
        {/* <SidebarTrigger /> */}
        <ScrollArea
          className="flex-1 px-2 py-0 min-h-0"
          viewportRef={viewportRef}
          onViewportScroll={handleViewportScroll}
        >
          {log.length > 0 ? (
            log.map((entry) =>
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
                  className={`whitespace-pre-wrap hover:bg-accent/50 rounded-md mt-2 cursor-pointer ${
                    currentlyEditingLogId === entry.id ? "bg-accent" : ""
                  }`}
                  onClick={() => setCurrentlyEditingLogId(entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setCurrentlyEditingLogId(entry.id);
                    }
                  }}
                >
                  {/* <span className="font-bold text-lg">
                  {entry.role === LogEntryRole.PLAYER ? "You" : "GM"}:
                </span> */}
                  <LogEntryBubble entry={entry} />
                  {entry.isActionError && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mr-1 ml-1 text-muted-foreground hover:text-foreground"
                        >
                          <MessageCircleWarning />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>
                          Failed to parse actions returned with this message.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )
            )
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
              // disabled={loading}
              className="rounded-xs"
            >
              {loading ? (
                // <Loader2Icon className="animate-spin" />
                <SquareIcon className="w-4 h-4 animate-pulse" />
              ) : (
                <SendIcon className="w-4 h-4" />
              )}
            </Button>
            <Button
              type="submit"
              onClick={handleRetry}
              disabled={loading}
              variant="default"
              className="rounded-xs"
            >
              <RefreshCwIcon strokeWidth={1.5} />
            </Button>
          </div>
        </div>
        {/* Render nested routes (settings modal) on top of demo content */}
        <div className="pointer-events-none absolute inset-0">
          {/* The modal content uses fixed positioning and pointer events, so just mount outlet */}
          <OutletWrapper />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Lightweight wrapper that renders nested outlet without affecting layout; defined here to avoid imports
import { Outlet } from "@tanstack/react-router";
function OutletWrapper() {
  return <Outlet />;
}
