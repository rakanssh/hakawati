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

export default function Demo() {
  const { log, addLog } = useGameStore();
  const [input, setInput] = useState("");
  const { send, loading, cancel } = useLLM();
  const handleSubmit = async () => {
    addLog({
      id: crypto.randomUUID(),
      role: "player",
      text: input,
      mode: "do",
    });
    setInput("");
    const res = await send({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: input }],
    });
    console.log(res);
    addLog({
      id: crypto.randomUUID(),
      role: "gm",
      text: res,
      mode: "do",
    });

    setInput("");
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
          <p>{log.map((l) => l.text).join("\n") || "No log"}</p>
        </ScrollArea>
        <div className="border-t p-4">
          <div className="flex w-full items-center space-x-2">
            <SidebarTrigger />
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
      </SidebarInset>
    </SidebarProvider>
  );
}
