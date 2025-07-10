import { useGameStore } from "@/store/useGameStore";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLLM } from "@/hooks/useLLM";
import { useSettingsStore } from "@/store/useSettingsStore";

interface LLMAction {
  type:
    | "MODIFY_STAT"
    | "ADD_TO_INVENTORY"
    | "REMOVE_FROM_INVENTORY"
    | "ADD_TO_STATS";
  payload: { name?: string; value?: number; item?: string };
}

interface LLMResponse {
  story: string;
  actions?: LLMAction[];
}

export default function Demo() {
  const {
    log,
    addLog,
    modifyStat,
    addToInventory,
    removeFromInventory,
    addToStats,
  } = useGameStore();
  const [input, setInput] = useState("");
  const { send, loading } = useLLM();
  const { model } = useSettingsStore();

  const handleSubmit = async () => {
    if (!input.trim()) return;
    if (!model) return;

    const playerInput = input;
    addLog({
      id: crypto.randomUUID(),
      role: "player",
      text: playerInput,
      mode: "do",
    });
    setInput("");

    let jsonResponse = "";
    try {
      jsonResponse = await send(playerInput, model);
      console.debug(jsonResponse);

      // Handle potential markdown formatting
      const startIndex = jsonResponse.indexOf("{");
      const endIndex = jsonResponse.lastIndexOf("}");

      if (startIndex === -1 || endIndex === -1) {
        throw new Error("Could not find a JSON object in the LLM response.");
      }

      const jsonString = jsonResponse.substring(startIndex, endIndex + 1);
      const response: LLMResponse = JSON.parse(jsonString);

      if (response.story) {
        addLog({
          id: crypto.randomUUID(),
          role: "gm",
          text: response.story,
          mode: "story",
        });
      }

      if (response.actions && Array.isArray(response.actions)) {
        for (const action of response.actions) {
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
    } catch (error) {
      console.error(
        "Failed to parse LLM response:",
        error,
        "Raw response:",
        jsonResponse
      );
      addLog({
        id: crypto.randomUUID(),
        role: "gm",
        text: "A strange force seems to have scrambled my thoughts. Please repeat that.",
        mode: "story",
      });
    }
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
        <ScrollArea className="flex-1 p-4 min-h-0">
          {log.length > 0 ? (
            log.map((entry) => (
              <div key={entry.id} className="mb-4 whitespace-pre-wrap">
                <span className="font-bold text-lg">
                  {entry.role === "player" ? "You" : "GM"}:
                </span>
                <p className="inline ml-2">{entry.text}</p>
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
            <SidebarTrigger />
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
