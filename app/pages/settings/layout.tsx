import { useCallback } from "react";
import { Outlet, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const tabs = [
  { to: "game", label: "Game" },
  { to: "api", label: "API" },
  { to: "scenario", label: "Scenario" },
  { to: "story-cards", label: "Story Cards" },
  { to: "model", label: "Model" },
] as const;

export default function SettingsLayout() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        const redirect = (search as Record<string, unknown>)?.redirect as
          | string
          | undefined;
        if (redirect) {
          navigate({ to: redirect, replace: true });
        } else {
          navigate({ to: "..", replace: true });
        }
      }
    },
    [navigate, search],
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={true}
        className="p-0 sm:max-w-[900px] w-[min(95vw,900px)] h-[min(85vh,700px)] flex flex-col"
      >
        <div className="grid grid-cols-[160px_1fr] gap-0 h-full ">
          <nav className="border-r px-3 py-4 overflow-auto">
            <ul className="flex flex-col gap-1">
              {tabs.map((tab) => (
                <li key={tab.to}>
                  <Link
                    to={"/settings/" + tab.to}
                    search={(old: unknown) => old as Record<string, unknown>}
                    className="block w-full rounded-md px-3 py-2 text-sm hover:bg-muted text-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
                  >
                    {tab.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <section className="py-3 px-4 overflow-auto bg-card h-full">
            <ScrollArea className="flex-1 px-2 py-0 min-h-0 h-full">
              <Outlet />
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
