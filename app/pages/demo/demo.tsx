import { useGameStore } from "@/store/useGameStore";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { decodeEscapedText } from "@/lib/utils";
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
  MessageCircleIcon,
  MessageCircleWarning,
  RefreshCwIcon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { nanoid } from "nanoid";
import { InlineEditableContent } from "@/components/game";
interface Action {
  type: "say" | "do" | "story";
  isRolling: boolean;
}
function getPlaceholder(action: Action) {
  let placeholder = "";
  switch (action.type) {
    case "do":
      placeholder = "You...";
      break;
    case "say":
      placeholder = "You say...";
      break;
    case "story":
      placeholder = "...";
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
  const { model } = useSettingsStore();
  const [currentlyEditingLogId, setCurrentlyEditingLogId] = useState<
    string | null
  >(null);
  const [action, setAction] = useState<Action>({
    type: "do",
    isRolling: false,
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState<boolean>(true);

  useEffect(() => {
    if (loading) setStickToBottom(true);
  }, [loading]);

  // Auto-scroll on log updates if sticking to bottom
  useEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth",
      block: "end",
    });
  }, [log]);

  const handleViewportScroll = () => {
    if (!loading) return;
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
      role: "gm",
      text: "...",
      mode: "story",
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

    // ! I don't like how this looks, disabling for now
    // let finalMessage;
    // switch (action.type) {
    //   case "do":
    //     finalMessage = `You ${
    //       playerInput.charAt(0).toLowerCase() + playerInput.slice(1)
    //     }`;
    //     break;
    //   case "say":
    //     finalMessage = `You say: "${
    //       playerInput.charAt(0).toUpperCase() + playerInput.slice(1)
    //     }"`;
    //     break;
    //   case "story":
    //     finalMessage =
    //       playerInput.charAt(0).toUpperCase() + playerInput.slice(1);
    //     break;
    // }

    addLog({
      id: nanoid(),
      role: "player",
      text: finalMessage,
      mode: action.type,
    });
    setInput("");
    executeLlmSend(finalMessage);
  };

  // Prevent body and html from scrolling while in the demo view
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const handleRetry = () => {
    if (loading) return;

    const lastEntry = log.at(-1);
    const secondLastEntry = log.at(-2);

    if (lastEntry?.role === "gm" && secondLastEntry?.role === "player") {
      removeLastLogEntry();
      executeLlmSend(secondLastEntry.text);
    } else {
      console.warn("Cannot retry, log state is not as expected.");
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="relative flex flex-col h-screen overflow-hidden">
        {/* <SidebarTrigger /> */}
        <ScrollArea
          className="flex-1 px-2 py-0 min-h-0"
          viewportRef={viewportRef}
          onViewportScroll={handleViewportScroll}
        >
          {log.length > 0 ? (
            log.map((entry) =>
              currentlyEditingLogId === entry.id ? (
                <div key={entry.id} className="bg-accent/50 rounded-md p-1">
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
                  {entry.role === "player" ? "You" : "GM"}:
                </span> */}
                  {entry.mode === "say" ? (
                    <div className="flex items-center rounded-sm border-accent-foreground/50 py-1 bg-blue-300/15">
                      <MessageCircleIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
                      <p className="inline whitespace-pre-wrap break-words mr-1">
                        {decodeEscapedText(entry.text)}
                      </p>
                    </div>
                  ) : entry.mode === "do" ? (
                    <div className="flex items-center rounded-sm border-accent-foreground/50 py-1 bg-amber-300/15">
                      <HandIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
                      <p className="inline whitespace-pre-wrap break-words mr-1">
                        {decodeEscapedText(entry.text)}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center ml-2">
                      <p className="inline whitespace-pre-wrap break-words">
                        {decodeEscapedText(entry.text)}
                      </p>
                    </div>
                  )}
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
            <p className="text-center text-muted-foreground">
              The story begins...
            </p>
          )}
          <div ref={bottomRef} className="mt-2" />
        </ScrollArea>
        <div className="border-t p-3">
          <div className="flex w-full items-end space-x-2">
            <Button
              variant={action.isRolling ? "default" : "ghost"}
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
              <SelectTrigger className="w-28">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="do">Do</SelectItem>
                <SelectItem value="say">Say</SelectItem>
                <SelectItem value="story">Story</SelectItem>
              </SelectContent>
            </Select>
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
              className="resize-none"
            />
            <Button type="submit" onClick={handleSubmit} disabled={loading}>
              {loading ? "Thinking..." : "Send"}
            </Button>
            <Button
              type="submit"
              onClick={handleRetry}
              disabled={loading}
              variant="ghost"
            >
              <RefreshCwIcon strokeWidth={1.5} />
            </Button>
          </div>
        </div>
        {/* Render nested routes (settings modal) on top of demo content */}
        <div className="pointer-events-none absolute inset-0">
          {/* The modal content uses fixed positioning and pointer events, so just mount outlet */}
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-ignore - Outlet is injected at route level, react-router handles it */}
          <OutletWrapper />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Lightweight wrapper that renders nested outlet without affecting layout; defined here to avoid imports
import { Outlet } from "react-router";
function OutletWrapper() {
  return <Outlet />;
}
