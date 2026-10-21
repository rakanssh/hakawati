import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

export interface SettingsSectionDefinition<TId extends string = string> {
  id: TId;
  label: ReactElement;
  description: ReactElement;
  groupId: string;
  group: ReactElement;
  icon: LucideIcon;
  component: ComponentType;
  /** Titles the section's subpages in the header, when it has any. */
  subpageTitle?: ComponentType<{ page: string }>;
}

export interface SettingsNavigation {
  /** The open subpage, or null on the section's own page. */
  page: string | null;
  push: (page: string) => void;
  /** Swaps the open subpage for another, so going back skips it. */
  replace: (page: string) => void;
  back: () => void;
  /** Returns to the section's own page. */
  reset: () => void;
}

const SettingsNavigationContext = createContext<SettingsNavigation>({
  page: null,
  push: () => {},
  replace: () => {},
  back: () => {},
  reset: () => {},
});

/** Lets a section open pages of its own under the settings header. */
export function useSettingsNavigation() {
  return useContext(SettingsNavigationContext);
}

interface SettingsShellProps<TId extends string> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly SettingsSectionDefinition<TId>[];
  defaultSection?: TId;
  visibleSections?: readonly TId[];
  title: ReactElement;
  description: ReactElement;
  renderSectionExtra?: (sectionId: TId) => ReactNode;
}

function groupSections<TId extends string>(
  sections: readonly SettingsSectionDefinition<TId>[],
) {
  const groups: Array<{
    label: ReactElement;
    sections: SettingsSectionDefinition<TId>[];
  }> = [];

  for (const section of sections) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.sections[0]?.groupId === section.groupId) {
      lastGroup.sections.push(section);
    } else {
      groups.push({ label: section.group, sections: [section] });
    }
  }

  return groups;
}

export function SettingsShell<TId extends string>({
  open,
  onOpenChange,
  sections,
  defaultSection,
  visibleSections,
  title,
  description,
  renderSectionExtra,
}: SettingsShellProps<TId>) {
  const { isCompactViewport, isMobilePlatform } = useIsMobile();
  const useCompactLayout = isCompactViewport || isMobilePlatform;
  const availableSections = useMemo(() => {
    if (!visibleSections) return sections;
    const allowed = new Set(visibleSections);
    const filtered = sections.filter((section) => allowed.has(section.id));
    return filtered.length > 0 ? filtered : sections;
  }, [sections, visibleSections]);

  const effectiveDefaultSection = defaultSection ?? availableSections[0]?.id;
  const [activeSection, setActiveSection] = useState<TId>(() => {
    return (
      availableSections.find(
        (section) => section.id === effectiveDefaultSection,
      )?.id ??
      availableSections[0]?.id ??
      effectiveDefaultSection
    );
  });
  const [showingDetail, setShowingDetail] = useState(!useCompactLayout);
  const [subpages, setSubpages] = useState<string[]>([]);
  const prevOpenRef = useRef(open);
  const detailViewportRef = useRef<HTMLDivElement>(null);
  const subpage = subpages[subpages.length - 1] ?? null;
  // The actions keep their identity, so sections can depend on them in effects.
  const navigationActions = useMemo<Omit<SettingsNavigation, "page">>(
    () => ({
      push: (page) => setSubpages((pages) => [...pages, page]),
      replace: (page) => setSubpages((pages) => [...pages.slice(0, -1), page]),
      back: () => setSubpages((pages) => pages.slice(0, -1)),
      reset: () => setSubpages([]),
    }),
    [],
  );
  const navigation = useMemo<SettingsNavigation>(
    () => ({ page: subpage, ...navigationActions }),
    [navigationActions, subpage],
  );

  useEffect(() => {
    if (detailViewportRef.current) detailViewportRef.current.scrollTop = 0;
  }, [subpage]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    if (open && !wasOpen) {
      const nextActive = (availableSections.find(
        (section) => section.id === effectiveDefaultSection,
      )?.id ??
        availableSections[0]?.id ??
        effectiveDefaultSection) as TId;

      setActiveSection(nextActive);
      setSubpages([]);
      setShowingDetail(
        !useCompactLayout ||
          availableSections.length <= 1 ||
          nextActive !== availableSections[0]?.id,
      );
    }
    prevOpenRef.current = open;
  }, [availableSections, effectiveDefaultSection, open, useCompactLayout]);

  useEffect(() => {
    if (!useCompactLayout) {
      setShowingDetail(true);
    }
  }, [useCompactLayout]);

  useEffect(() => {
    if (availableSections.some((section) => section.id === activeSection)) {
      return;
    }

    const fallback = availableSections[0]?.id ?? effectiveDefaultSection;
    if (fallback !== activeSection) {
      setActiveSection(fallback as TId);
      setShowingDetail(false);
    }
  }, [activeSection, availableSections, effectiveDefaultSection]);

  const activeDefinition =
    availableSections.find((section) => section.id === activeSection) ??
    availableSections[0];
  const ActiveComponent = activeDefinition?.component;
  const groupedSections = groupSections(availableSections);

  function selectSection(sectionId: TId) {
    setActiveSection(sectionId);
    setSubpages([]);
    if (useCompactLayout) {
      setShowingDetail(true);
    }
  }

  const showSettingsList = useCompactLayout && !showingDetail;
  const SubpageTitle = activeDefinition?.subpageTitle;
  const showingSubpage = subpage !== null && !showSettingsList;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (!showingSubpage) return;
          event.preventDefault();
          navigation.back();
        }}
        className="top-0 left-0 flex h-dvh !w-screen !max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]"
      >
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <header className="flex shrink-0 items-center gap-2 border-b bg-background px-3 py-3 md:px-6">
            {showingSubpage ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back"
                onClick={navigation.back}
              >
                <ChevronLeftIcon className="size-4 rtl:rotate-180" />
              </Button>
            ) : useCompactLayout &&
              showingDetail &&
              availableSections.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back to settings"
                onClick={() => setShowingDetail(false)}
              >
                <ChevronLeftIcon className="size-4 rtl:rotate-180" />
              </Button>
            ) : null}

            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-lg leading-tight md:text-xl">
                {showSettingsList ? (
                  title
                ) : showingSubpage && SubpageTitle ? (
                  <SubpageTitle page={subpage} />
                ) : (
                  (activeDefinition?.label ?? title)
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {!showSettingsList
                  ? (activeDefinition?.description ?? description)
                  : description}
              </DialogDescription>
            </div>

            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close settings"
                className="shrink-0"
              >
                <XIcon className="size-4" />
              </Button>
            </DialogClose>
          </header>

          <div className="min-h-0 flex-1 sm:grid sm:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
            <ScrollArea
              className={cn(
                "min-h-0 bg-background sm:block sm:border-e",
                showSettingsList ? "block h-full" : "hidden",
              )}
            >
              <nav
                className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:max-w-none sm:p-5 lg:p-6"
                aria-label="Settings"
              >
                {groupedSections.map((group, groupIndex) => (
                  <div key={groupIndex} className="flex flex-col gap-2">
                    <div className="px-1 text-xs font-medium uppercase tracking-normal text-muted-foreground">
                      {group.label}
                    </div>
                    <div className="overflow-hidden rounded-xs border bg-card">
                      {group.sections.map((section) => {
                        const Icon = section.icon;

                        return (
                          <button
                            key={section.id}
                            type="button"
                            className={cn(
                              "relative flex min-h-12 w-full items-center gap-3 border-b px-3 py-3 text-start text-sm transition-colors last:border-b-0 hover:bg-accent hover:text-accent-foreground",
                              !useCompactLayout &&
                                section.id === activeSection &&
                                "bg-accent text-accent-foreground",
                            )}
                            onClick={() => selectSection(section.id)}
                            aria-current={
                              section.id === activeSection ? "page" : undefined
                            }
                          >
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {section.label}
                            </span>
                            {renderSectionExtra?.(section.id)}
                            {useCompactLayout ? (
                              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </ScrollArea>

            <section
              className={cn(
                "min-h-0 bg-card sm:flex sm:flex-col",
                // Phones stack the panes, so the detail needs a height to scroll in.
                showSettingsList ? "hidden" : "flex h-full flex-col",
              )}
            >
              <ScrollArea className="h-full" viewportRef={detailViewportRef}>
                <div className="w-full px-4 py-4 sm:max-w-none sm:px-6 sm:py-6 lg:px-8 xl:px-10">
                  <SettingsNavigationContext.Provider value={navigation}>
                    {ActiveComponent && <ActiveComponent />}
                  </SettingsNavigationContext.Provider>
                </div>
              </ScrollArea>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
