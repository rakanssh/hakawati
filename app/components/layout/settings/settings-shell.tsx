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
  /** Lets the section use more width on large screens, for side-by-side columns. */
  wide?: boolean;
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
        <div className="flex min-h-0 flex-1 flex-col bg-background sm:grid sm:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Phones show the list and a section one at a time; wider screens keep the list beside it. */}
          <aside
            className={cn(
              "min-h-0 flex-col bg-background sm:flex sm:border-e",
              showSettingsList ? "flex flex-1" : "hidden",
            )}
          >
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3 sm:border-b-0 sm:px-5 sm:pt-5 sm:pb-2">
              {showSettingsList ? (
                <>
                  <DialogTitle className="min-w-0 flex-1 truncate text-lg leading-tight">
                    {title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {description}
                  </DialogDescription>
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate text-lg font-semibold leading-tight">
                  {title}
                </span>
              )}
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close settings"
                  className="shrink-0 sm:hidden"
                >
                  <XIcon className="size-4" />
                </Button>
              </DialogClose>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <nav
                className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:max-w-none sm:gap-5 sm:px-3 sm:pt-2 sm:pb-5"
                aria-label="Settings"
              >
                {groupedSections.map((group, groupIndex) => (
                  <div
                    key={groupIndex}
                    className="flex flex-col gap-2 sm:gap-1"
                  >
                    <div
                      data-sidebar-heading=""
                      className="px-1 text-xs font-semibold text-muted-foreground sm:px-2.5"
                    >
                      {group.label}
                    </div>
                    <div className="overflow-hidden rounded-xs border bg-card sm:flex sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-0 sm:bg-transparent">
                      {group.sections.map((section) => {
                        const Icon = section.icon;
                        const active = section.id === activeSection;

                        return (
                          <button
                            key={section.id}
                            type="button"
                            className={cn(
                              "relative flex min-h-12 w-full items-center gap-3 border-b px-3 py-3 text-start text-sm transition-colors last:border-b-0 hover:bg-accent hover:text-accent-foreground",
                              "sm:min-h-9 sm:gap-2.5 sm:rounded-xs sm:border-b-0 sm:px-2.5 sm:py-1.5 sm:text-foreground/85 sm:hover:bg-accent/60",
                              active &&
                                "sm:bg-primary/15 sm:text-primary sm:hover:bg-primary/20 sm:hover:text-primary",
                            )}
                            onClick={() => selectSection(section.id)}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon className="size-4 shrink-0 text-muted-foreground sm:text-current" />
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate font-medium",
                                active ? "sm:font-semibold" : "sm:font-normal",
                              )}
                            >
                              {section.label}
                            </span>
                            {renderSectionExtra?.(section.id)}
                            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground sm:hidden rtl:rotate-180" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </ScrollArea>
          </aside>

          <section
            className={cn(
              "min-h-0 flex-col bg-card sm:flex",
              showSettingsList ? "hidden" : "flex flex-1",
            )}
          >
            <header className="flex shrink-0 items-center gap-2 border-b px-3 py-3 md:px-6">
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
                {showSettingsList ? (
                  <span className="block truncate text-lg font-semibold leading-tight md:text-xl">
                    {activeDefinition?.label ?? title}
                  </span>
                ) : (
                  <>
                    <DialogTitle className="truncate text-lg leading-tight md:text-xl">
                      {showingSubpage && SubpageTitle ? (
                        <SubpageTitle page={subpage} />
                      ) : (
                        (activeDefinition?.label ?? title)
                      )}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      {activeDefinition?.description ?? description}
                    </DialogDescription>
                  </>
                )}
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

            <ScrollArea
              className="min-h-0 flex-1"
              viewportRef={detailViewportRef}
            >
              <div
                className={cn(
                  // Rows stay readable on wide screens instead of spreading across the pane.
                  "w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 xl:px-10",
                  activeDefinition?.wide ? "max-w-5xl" : "max-w-3xl",
                )}
              >
                <SettingsNavigationContext.Provider value={navigation}>
                  {ActiveComponent && <ActiveComponent />}
                </SettingsNavigationContext.Provider>
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
