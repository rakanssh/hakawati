import { useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const tabs = [
  { to: "api", label: "API" },
  { to: "scenario", label: "Scenario" },
  { to: "story-cards", label: "Story Cards" },
  { to: "model", label: "Model" },
] as const;

export default function SettingsLayout() {
  const navigate = useNavigate();
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) navigate("..", { replace: true });
    },
    [navigate]
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
                  <NavLink
                    to={tab.to}
                    replace
                    className={({ isActive }) =>
                      [
                        "block w-full rounded-md px-3 py-2 text-sm",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted text-foreground",
                      ].join(" ")
                    }
                  >
                    {tab.label}
                  </NavLink>
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
