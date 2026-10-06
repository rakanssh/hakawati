import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  BookOpenIcon,
  BotIcon,
  ChevronRightIcon,
  LibraryIcon,
  PaletteIcon,
  PanelRightCloseIcon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingsLayoutProvider } from "@/components/layout/settings/settings-layout";
import SettingsTale from "@/components/layout/settings/tale";
import SettingsStoryCards from "@/components/layout/settings/story-cards";
import SettingsInventoryStats from "@/components/layout/settings/inventory-stats";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { useTaleStore } from "@/store/useTaleStore";
import {
  STORY_PANEL_WIDTH,
  useStoryPanelStore,
  type StoryPanelTab,
} from "@/store/useStoryPanelStore";
import { GameMode } from "@/types";
import { AiTab } from "./ai-tab";
import { DisplayTab } from "./display-tab";

export const STORY_PANEL_ID = "story-panel";

type TabDefinition = {
  id: StoryPanelTab;
  icon: ComponentType<{ className?: string }>;
  label: React.ReactNode;
  render: () => React.ReactNode;
};

function StoryPanelContent({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();
  const tab = useStoryPanelStore((state) => state.tab);
  const setTab = useStoryPanelStore((state) => state.setTab);
  const taleName = useTaleStore((state) => state.name);
  const gameMode = useTaleStore((state) => state.gameMode);

  const tabs: TabDefinition[] = [
    {
      id: "story",
      icon: BookOpenIcon,
      label: <Trans>Story</Trans>,
      render: () => <SettingsTale />,
    },
    {
      id: "cards",
      icon: LibraryIcon,
      label: <Trans>Cards</Trans>,
      render: () => <SettingsStoryCards />,
    },
    ...(gameMode === GameMode.GM
      ? [
          {
            id: "character" as const,
            icon: UserRoundIcon,
            label: <Trans>Character</Trans>,
            render: () => <SettingsInventoryStats />,
          },
        ]
      : []),
    {
      id: "ai",
      icon: BotIcon,
      label: <Trans>AI</Trans>,
      render: () => <AiTab />,
    },
    {
      id: "display",
      icon: PaletteIcon,
      label: <Trans>Display</Trans>,
      render: () => <DisplayTab />,
    },
  ];
  // The Character tab only exists in Game Master tales.
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "story";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setTab(value as StoryPanelTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
        <h2
          data-sidebar-heading=""
          dir="auto"
          className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground"
          title={taleName}
        >
          {taleName.trim() || <Trans>Story</Trans>}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
              onClick={onClose}
              aria-label={t`Close story panel`}
            >
              <PanelRightCloseIcon className="size-4 rtl:-scale-x-100" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <Trans>Close story panel</Trans>
          </TooltipContent>
        </Tooltip>
      </div>
      <TabsList
        data-story-panel-tabs=""
        className="h-auto w-full shrink-0 justify-stretch gap-0 rounded-none border-b border-sidebar-border bg-transparent p-0 px-2"
      >
        {tabs.map(({ id, icon: Icon, label }) => (
          <TabsTrigger
            key={id}
            value={id}
            className={cn(
              "relative h-auto flex-1 flex-col gap-1 rounded-none border-0 px-1 pt-1.5 pb-2 text-[0.7rem] font-medium text-sidebar-foreground/60 shadow-none",
              "hover:text-sidebar-foreground data-[state=active]:bg-transparent data-[state=active]:text-sidebar-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent",
              "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-primary",
            )}
          >
            <Icon className="size-4" />
            <span className="max-w-full truncate">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <ScrollArea className="min-h-0 flex-1">
        <SettingsLayoutProvider variant="plain">
          {tabs.map(({ id, render }) => (
            <TabsContent key={id} value={id} className="px-4 pt-4 pb-6">
              {render()}
            </TabsContent>
          ))}
        </SettingsLayoutProvider>
      </ScrollArea>
    </Tabs>
  );
}

/** The story always keeps at least this much room beside the panel. */
const MIN_STORY_WIDTH = 360;

const fitWidth = (width: number) =>
  Math.round(
    Math.max(
      STORY_PANEL_WIDTH.min,
      Math.min(
        width,
        STORY_PANEL_WIDTH.max,
        window.innerWidth - MIN_STORY_WIDTH,
      ),
    ),
  );

/**
 * The story panel on the right of the play screen: story setup, story cards, the character in Game
 * Master tales, the narrator model and the look of the tale. On desktop it is a side pane that shares
 * the screen with the story and can be resized from its edge; on phones it slides over the story.
 */
export function StoryPanel() {
  const { t } = useLingui();
  const open = useStoryPanelStore((state) => state.open);
  const setOpen = useStoryPanelStore((state) => state.setOpen);
  const savedWidth = useStoryPanelStore((state) => state.width);
  const setWidth = useStoryPanelStore((state) => state.setWidth);
  const { isMobilePlatform } = useIsMobile();
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? fitWidth(savedWidth);
  const close = () => setOpen(false);

  // A remembered open panel is welcome beside the story, but not sliding over it the moment a tale opens.
  const startedOnPhone = useRef(isMobilePlatform);
  useEffect(() => {
    if (startedOnPhone.current) setOpen(false);
  }, [setOpen]);

  if (isMobilePlatform) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          id={STORY_PANEL_ID}
          side="right"
          showCloseButton={false}
          data-story-panel=""
          aria-describedby={undefined}
          className="w-[min(100vw,var(--story-panel-width))] gap-0 border-sidebar-border/70 bg-sidebar p-0 text-sidebar-foreground sm:max-w-none"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <SheetTitle className="sr-only">{t`Story panel`}</SheetTitle>
          <StoryPanelContent onClose={close} />
        </SheetContent>
      </Sheet>
    );
  }

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const rtl = getComputedStyle(handle).direction === "rtl";
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    handle.setPointerCapture(event.pointerId);
    document.documentElement.dataset.resizing = "";
    const move = (moveEvent: globalThis.PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      latest = fitWidth(startWidth + (rtl ? dx : -dx));
      setDragWidth(latest);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      delete document.documentElement.dataset.resizing;
      setWidth(latest);
      setDragWidth(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const resizeWithKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = event.shiftKey ? 64 : 16;
    const grow = {
      ArrowLeft: rtl ? -step : step,
      ArrowRight: rtl ? step : -step,
    }[event.key];
    if (grow) {
      event.preventDefault();
      setWidth(fitWidth(width + grow));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setWidth(
        fitWidth(
          event.key === "Home" ? STORY_PANEL_WIDTH.min : STORY_PANEL_WIDTH.max,
        ),
      );
    }
  };

  return (
    <>
      <StoryPanelHandle open={open} onToggle={() => setOpen(!open)} />
      <aside
        id={STORY_PANEL_ID}
        aria-label={t`Story panel`}
        inert={!open}
        className={cn(
          "relative z-45 h-full shrink-0 overflow-hidden",
          dragWidth === null &&
            "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ width: open ? width : 0 }}
      >
        <div
          data-story-panel=""
          className="flex h-full flex-col border-s border-sidebar-border/70 bg-sidebar text-sidebar-foreground"
          style={{ width }}
        >
          <StoryPanelContent onClose={close} />
        </div>
        {/* Drag the panel's edge, or focus it and use the arrow keys, to resize. Double-click resets. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t`Resize story panel`}
          aria-valuemin={STORY_PANEL_WIDTH.min}
          aria-valuemax={STORY_PANEL_WIDTH.max}
          aria-valuenow={width}
          tabIndex={open ? 0 : -1}
          data-story-panel-resizer=""
          onPointerDown={startResize}
          onKeyDown={resizeWithKeys}
          onDoubleClick={() => setWidth(fitWidth(STORY_PANEL_WIDTH.default))}
          className="absolute inset-y-0 start-0 z-10 w-1.5 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none data-[active]:bg-primary/60"
          data-active={dragWidth !== null || undefined}
        />
      </aside>
    </>
  );
}

/**
 * A pull tab on the story's edge, in a slim rail of its own so it never sits over the text or the
 * scrollbar. Closed, it hangs off the window's edge like a drawer pull; open, it rides on the panel's edge.
 */
function StoryPanelHandle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="relative z-45 w-6 shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-story-panel-handle=""
            data-state={open ? "open" : "closed"}
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={STORY_PANEL_ID}
            aria-label={open ? t`Close story panel` : t`Open story panel`}
            className="absolute end-0 top-[38%] flex w-6 -translate-y-1/2 flex-col items-center gap-2 rounded-s-md border border-e-0 border-sidebar-border bg-sidebar/95 py-3 text-sidebar-foreground/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-sidebar hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? (
              <ChevronRightIcon className="size-4 rtl:-scale-x-100" />
            ) : (
              <BookOpenIcon className="size-4" />
            )}
            <span
              data-sidebar-heading=""
              className="text-[0.7rem] font-medium tracking-wide [writing-mode:vertical-rl]"
            >
              <Trans>Story</Trans>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {open ? (
            <Trans>Close story panel</Trans>
          ) : (
            <Trans>Story, cards and display</Trans>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
