import { useGameStore } from "@/store/useGameStore";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export default function Demo() {
  const log = useGameStore((state) => state.log);
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* Main */}
      <main className="flex flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold">Hakawati</h1>
          <p>{log.map((l) => l.text).join("\n") || "No log"}</p>
        </div>
      </main>
      {/* Input */}
    </SidebarProvider>
  );
}
