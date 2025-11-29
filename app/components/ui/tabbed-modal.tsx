import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/useIsMobile";

export interface TabDefinition<TId extends string = string> {
  id: TId;
  label: string;
  component: React.ComponentType;
}

export interface TabbedModalProps<TId extends string> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: readonly TabDefinition<TId>[];
  defaultTab?: TId;
  visibleTabs?: readonly TId[];
  title?: string;
  /** Render extra content for a tab (e.g., notification badge) */
  renderTabExtra?: (tabId: TId) => ReactNode;
}

export function TabbedModal<TId extends string>({
  open,
  onOpenChange,
  tabs,
  defaultTab,
  visibleTabs,
  title = "Settings",
  renderTabExtra,
}: TabbedModalProps<TId>) {
  const effectiveDefaultTab = defaultTab ?? tabs[0]?.id;

  const availableTabs = useMemo(() => {
    if (!visibleTabs) return tabs;
    const allowed = new Set(visibleTabs);
    const filtered = tabs.filter((tab) => allowed.has(tab.id));
    return filtered.length > 0 ? filtered : tabs;
  }, [tabs, visibleTabs]);

  const { isMobileViewport } = useIsMobile();

  const [activeTab, setActiveTab] = useState<TId>(() => {
    const fallback =
      availableTabs.find((tab) => tab.id === effectiveDefaultTab)?.id ??
      availableTabs[0]?.id ??
      effectiveDefaultTab;
    return fallback as TId;
  });

  const prevOpenRef = useRef(open);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    if (open && !wasOpen) {
      const nextActive =
        availableTabs.find((tab) => tab.id === effectiveDefaultTab)?.id ??
        availableTabs[0]?.id ??
        effectiveDefaultTab;
      setActiveTab(nextActive as TId);
    }
    prevOpenRef.current = open;
  }, [open, effectiveDefaultTab, availableTabs]);

  useEffect(() => {
    const isActiveAvailable = availableTabs.some((tab) => tab.id === activeTab);
    if (isActiveAvailable) return;
    const fallback = availableTabs[0]?.id ?? effectiveDefaultTab;
    if (fallback !== activeTab) {
      setActiveTab(fallback as TId);
    }
  }, [availableTabs, activeTab, effectiveDefaultTab]);

  const ActiveComponent =
    availableTabs.find((tab) => tab.id === activeTab)?.component ??
    availableTabs[0]?.component;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!isMobileViewport}
        className="p-0 gap-0 w-[95vw] h-[90vh] sm:max-w-[1300px] sm:max-h-[900px] flex flex-col overflow-hidden"
      >
        <DialogTitle></DialogTitle>
        {/* Mobile: Dropdown selector */}
        <div className="md:hidden border-b px-4 py-3">
          <Select
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as TId)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTabs.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>
                  <span className="flex items-center gap-2">
                    {tab.label}
                    {renderTabExtra?.(tab.id)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop & Mobile content */}
        <div className="md:grid md:grid-cols-[160px_1fr] gap-0 flex-1 overflow-hidden flex flex-col">
          {/* Desktop: Sidebar navigation */}
          <nav className="hidden md:block border-r px-3 py-4 overflow-auto">
            <ul className="flex flex-col gap-1">
              {availableTabs.map((tab) => (
                <li key={tab.id}>
                  <Button
                    variant={activeTab === tab.id ? "default" : "ghost"}
                    className="relative w-full justify-start text-sm"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                    {renderTabExtra?.(tab.id)}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content area */}
          <section className="py-3 bg-card h-full overflow-hidden flex flex-col min-w-0">
            <h2 className="px-4 pb-3 text-lg font-semibold border-b mb-3">
              {availableTabs.find((tab) => tab.id === activeTab)?.label ??
                title}
            </h2>
            <ScrollArea className="flex-1 w-full">
              <div className="px-4 w-full overflow-hidden">
                {ActiveComponent && <ActiveComponent />}
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
