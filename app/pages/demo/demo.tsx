import { useGameStore } from "@/store/useGameStore";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Demo() {
  const { log, addLog } = useGameStore();
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    addLog({
      id: crypto.randomUUID(),
      role: "player",
      text: input,
      mode: "do",
    });
    setInput("");
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <main className="flex flex-col h-screen p-4">
          <div className="flex-1 overflow-y-auto">
            <p>{log.map((l) => l.text).join("\n") || "No log"}</p>
          </div>
          <div className="flex w-full items-center space-x-2">
            <SidebarTrigger />
            <div className="bg-background flex w-full items-center space-x-2">
              <Input
                type="text"
                placeholder="What do you do?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <Button type="submit" onClick={handleSubmit}>
                Send
              </Button>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
