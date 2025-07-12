import { useGameStore } from "@/store/useGameStore";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function Demo() {
  const {
    log,
    addLog,
    modifyStat,
    addToInventory,
    removeFromInventory,
    addToStats,
    updateLogEntry,
  } = useGameStore();
  const [input, setInput] = useState("");
  const { send, loading } = useLLM();
  const { model } = useSettingsStore();
  const [action, setAction] = useState<"say" | "do" | "story">("do");
  const [isRolling, setIsRolling] = useState(false);

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
          playerInput.charAt(0).toLowerCase() + playerInput.slice(1)
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

    const gmResponseId = crypto.randomUUID();
    addLog({
      id: gmResponseId,
      role: "gm",
      text: "...",
      mode: "story",
    });

    let storyContent = "";

    send(finalMessage, model, {
      onStoryStream: (storyChunk) => {
        storyContent += storyChunk;
        updateLogEntry(gmResponseId, { text: storyContent });
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
                  removeFromInventory(action.payload.item);
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
      onError: (error) => {
        console.error("LLM Error:", error);
        updateLogEntry(gmResponseId, {
          text: "A strange force seems to have scrambled my thoughts. Please repeat that.",
        });
      },
    });
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

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        <SidebarTrigger />
        <ScrollArea className="flex-1 p-4 min-h-0">
          {log.length > 0 ? (
            log.map((entry) => (
              <div key={entry.id} className="mb-4 whitespace-pre-wrap">
                {/* <span className="font-bold text-lg">
                  {entry.role === "player" ? "You" : "GM"}:
                </span> */}
                <p className="inline ">{entry.text}</p>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground">
              The story begins...
            </p>
          )}
        </ScrollArea>
        <div className="border-t p-4">
          <div className="flex w-full items-center space-x-2">
            <Checkbox
              checked={isRolling}
              onCheckedChange={(checked) =>
                setIsRolling(checked === "indeterminate" ? false : checked)
              }
              disabled={loading}
            />
            <Label>🎲</Label>
            <Select
              value={action}
              onValueChange={(value) =>
                setAction(value as "say" | "do" | "story")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="do">Do</SelectItem>
                <SelectItem value="say">Say</SelectItem>
                <SelectItem value="story">Story</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="What do you do?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <Button type="submit" onClick={handleSubmit} disabled={loading}>
              {loading ? "Thinking..." : "Send"}
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
