import { useGameStore } from "@/store/useGameStore";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
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
  FileWarningIcon,
  InfoIcon,
  MessageCircleWarning,
  RefreshCwIcon,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getPlaceholder(action: "say" | "do" | "story", isRolling: boolean) {
  let placeholder = "";
  switch (action) {
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
  if (isRolling) {
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
  const [action, setAction] = useState<"say" | "do" | "story">("do");
  const [isRolling, setIsRolling] = useState(false);

  const executeLlmSend = (message: string) => {
    if (!model) {
      console.error("LLM model not configured.");
      return;
    }
    const gmResponseId = crypto.randomUUID();
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

    const playerInput = isRolling
      ? input + ` [Roll: ${Math.floor(Math.random() * 100) + 1}/100]`
      : input;

    let finalMessage;
    switch (action) {
      case "do":
        finalMessage = `You ${
          playerInput.charAt(0).toLowerCase() + playerInput.slice(1)
        }`;
        break;
      case "say":
        finalMessage = `You say: "${
          playerInput.charAt(0).toUpperCase() + playerInput.slice(1)
        }"`;
        break;
      case "story":
        finalMessage =
          playerInput.charAt(0).toUpperCase() + playerInput.slice(1);
        break;
    }

    addLog({
      id: crypto.randomUUID(),
      role: "player",
      text: finalMessage,
      mode: action,
    });
    setInput("");
    executeLlmSend(finalMessage);
  };

  // Prevent body and html from scrolling
  //TODO: Find the proper way to do this
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
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
      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        <SidebarTrigger />
        <ScrollArea className="flex-1 p-4 min-h-0">
          {log.length > 0 ? (
            log.map((entry) => (
              <div
                key={entry.id}
                className=" whitespace-pre-wrap hover:bg-accent/50 rounded-md p-1 cursor-pointer"
              >
                {/* <span className="font-bold text-lg">
                  {entry.role === "player" ? "You" : "GM"}:
                </span> */}

                <p className="inline ">{entry.text}</p>
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
                      <p>Failed to parse actions returned with this message.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground">
              The story begins...
            </p>
          )}
        </ScrollArea>
        <div className="border-t p-4">
          <div className="flex w-full items-end space-x-2">
            <Button
              variant={isRolling ? "default" : "interactive-ghost"}
              size="icon"
              onClick={() => setIsRolling(!isRolling)}
              disabled={loading}
            >
              <DicesIcon strokeWidth={1.5} />
            </Button>

            <Select
              value={action}
              onValueChange={(value) =>
                setAction(value as "say" | "do" | "story")
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
              placeholder={getPlaceholder(action, isRolling)}
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
              variant="interactive-ghost"
            >
              <RefreshCwIcon strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
