import { useGameStore } from "@/store/useGameStore";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/chat";

export default function Demo() {
  const log = useGameStore((state) => state.log);
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      {/* Main */}
      <SidebarTrigger />
      <main className="flex flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center">
          <p>{log.map((l) => l.text).join("\n") || "No log"}</p>
        </div>
      </main>
      {/* Input */}
    </SidebarProvider>
  );
}
