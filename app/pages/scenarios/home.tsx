import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";
import {
  useScenariosList,
  useScenariosExport,
  useScenariosImport,
} from "@/hooks/useScenarios";
import { initTaleFromScenario } from "@/services/scenario.service";
import { canSyncNewTales } from "@/services/new-tale-sync";
import { addSyncChangedListener } from "@/services/sync-wakeup";
import { useLoadTale } from "@/hooks/useGameSaves";
import {
  bytesToObjectUrl,
  cn,
  formatExactDateTime,
  formatRelativeTime,
} from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  ClipboardIcon,
  FlagIcon,
  Loader2,
  MoreHorizontalIcon,
  Sparkles,
  SlidersHorizontalIcon,
  UploadCloudIcon,
  VenetianMask,
} from "lucide-react";
import placeholderImage from "@/assets/scen-ph.png";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  GenerateScenarioDialog,
  PublishScenarioDialog,
} from "@/components/scenario";
import { useEffect, useMemo, useState } from "react";
import {
  useCatalogActions,
  useCatalogClient,
  useCatalogScenarioList,
  usePublishedCatalogScenarios,
  useScenarioPublishLinks,
} from "@/hooks/useCatalogScenarios";
import {
  CATALOG_SORTS,
  type CatalogOwnedScenarioRecord,
  type CatalogScenarioRecord,
} from "@/types/catalog.type";
import { getScenarioById } from "@/services/scenario.service";
import type { Scenario } from "@/types/context.type";
import { CatalogTagInput } from "@/components/catalog/CatalogTagInput";
import { imageBadgeClass, imageMenuButtonClass } from "@/lib/card-badges";

type PendingScenarioDelete = {
  id: string;
  name: string;
};

type CatalogCardScenario = CatalogScenarioRecord | CatalogOwnedScenarioRecord;
type ScenarioTab = "local" | "discover" | "published";

const libraryGridClass =
  "grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]";
const cardActionButtonClass = "h-8";
const scenarioCardBodyClass =
  "flex h-[9.75rem] flex-col gap-1.5 px-2.5 pb-2.5 pt-2";

function catalogAssetUrl(baseUrl: string, path: string | null | undefined) {
  if (!path) return placeholderImage;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}${path}`;
}

function hiddenByModeration(scenario: CatalogCardScenario) {
  return (
    scenario.status === "hidden" &&
    "moderation" in scenario &&
    scenario.moderation.status === "rejected"
  );
}

function awaitingModeration(scenario: CatalogCardScenario) {
  return (
    "moderation" in scenario && scenario.moderation.status === "needs_review"
  );
}

function scenarioTabFromSearch(): ScenarioTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "discover" || tab === "published" ? tab : "local";
}

function replaceScenarioTabSearch(tab: ScenarioTab) {
  const url = new URL(window.location.href);
  if (tab === "local") {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tab);
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function TagPreview({ tags, limit = 3 }: { tags: string[]; limit?: number }) {
  const visible = tags.slice(0, limit);
  const extra = tags.length - visible.length;
  if (!visible.length) return null;

  return (
    <div className="flex h-6 min-w-0 gap-1 overflow-hidden">
      {visible.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="h-6 max-w-28 shrink-0 truncate text-xs"
        >
          {tag}
        </Badge>
      ))}
      {extra > 0 ? (
        <Badge variant="outline" className="h-6 shrink-0 text-xs">
          +{extra}
        </Badge>
      ) : null}
    </div>
  );
}

function CatalogScenarioCard({
  baseUrl,
  scenario,
  actions,
  onView,
  onStart,
  onStartPrivate,
  onReport,
  onUnpublish,
  onThumbnail,
}: {
  baseUrl: string;
  scenario: CatalogCardScenario;
  actions: "discover" | "published";
  onView?: (scenario: CatalogCardScenario) => void;
  onStart?: (scenario: CatalogCardScenario) => void;
  onStartPrivate?: (scenario: CatalogCardScenario) => void;
  onReport?: (scenario: CatalogCardScenario) => void;
  onUnpublish?: (scenario: CatalogCardScenario) => void;
  onThumbnail?: (scenario: CatalogCardScenario, file: File) => void;
}) {
  const catalogDateMs = Date.parse(scenario.publishedAt ?? scenario.updatedAt);
  const dateLabel = formatRelativeTime(
    Number.isNaN(catalogDateMs) ? 0 : catalogDateMs,
  );
  const startsLabel =
    scenario.startCount === 1 ? "1 start" : `${scenario.startCount} starts`;
  const isModerationHidden = hiddenByModeration(scenario);
  const isAwaitingModeration = awaitingModeration(scenario);
  const hasModerationBadge = isModerationHidden || isAwaitingModeration;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onView?.(scenario)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView?.(scenario);
        }
      }}
      className="flex cursor-pointer flex-col gap-0 overflow-hidden border-accent/50 p-0 transition-colors hover:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={`View ${scenario.title}`}
    >
      <CardHeader className="p-0 m-0">
        <div className="relative">
          <img
            src={catalogAssetUrl(baseUrl, scenario.thumbnail?.downloadUrl)}
            alt={`${scenario.title} thumbnail`}
            className="aspect-[2/1] w-full object-cover"
          />
          <div
            className="absolute right-1.5 top-0.5 z-10"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className={imageMenuButtonClass}
                  aria-label="Scenario actions"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
                <DropdownMenuItem onClick={() => onView?.(scenario)}>
                  <Trans>View</Trans>
                </DropdownMenuItem>
                {actions === "discover" ? (
                  <DropdownMenuItem onClick={() => onReport?.(scenario)}>
                    <FlagIcon className="h-4 w-4" />
                    <Trans>Report</Trans>
                  </DropdownMenuItem>
                ) : null}
                {actions === "published" && onThumbnail ? (
                  <DropdownMenuItem
                    asChild
                    onSelect={(e) => e.preventDefault()}
                  >
                    <label>
                      <Trans>Thumbnail</Trans>
                      <input
                        className="hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onThumbnail(scenario, file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </DropdownMenuItem>
                ) : null}
                {actions === "published" ? (
                  <DropdownMenuItem onClick={() => onUnpublish?.(scenario)}>
                    <Trans>Unpublish</Trans>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className={`absolute left-1 top-1 ${imageBadgeClass}`}>
                {dateLabel} - {startsLabel}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              {formatExactDateTime(
                Number.isNaN(catalogDateMs) ? 0 : catalogDateMs,
              )}
            </TooltipContent>
          </Tooltip>
          <Badge
            className={cn(
              "absolute bottom-1 left-1",
              hasModerationBadge ? "max-w-[55%]" : "max-w-[calc(100%-0.5rem)]",
              imageBadgeClass,
            )}
          >
            <span className="truncate">{scenario.author.displayName}</span>
          </Badge>
          {isModerationHidden ? (
            <Badge className={`absolute bottom-1 right-1 ${imageBadgeClass}`}>
              <Trans>Hidden by moderation</Trans>
            </Badge>
          ) : isAwaitingModeration ? (
            <Badge className={`absolute bottom-1 right-1 ${imageBadgeClass}`}>
              <Trans>Awaiting moderation</Trans>
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={scenarioCardBodyClass}>
        <span className="line-clamp-1 min-w-0 text-sm font-semibold">
          {scenario.title}
        </span>
        <p
          className={cn(
            "text-sm leading-snug text-muted-foreground",
            actions === "published"
              ? "line-clamp-3 min-h-[3.6rem]"
              : "line-clamp-2 min-h-10",
          )}
        >
          {scenario.summary}
        </p>
        <TagPreview tags={scenario.tags} />
        {actions === "discover" ? (
          <div
            className={cn(
              "mt-auto grid",
              onStartPrivate && "grid-cols-[1fr_auto] gap-1",
            )}
          >
            <Button
              size="sm"
              className={cardActionButtonClass}
              onClick={(event) => {
                event.stopPropagation();
                onStart?.(scenario);
              }}
            >
              <Trans>Start Tale</Trans>
            </Button>
            {onStartPrivate ? (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartPrivate(scenario);
                }}
                aria-label="Start local-only tale"
              >
                <VenetianMask className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ScenariosHome() {
  const { t } = useLingui();
  const { items, loading, error, page, limit, total, setPage, remove } =
    useScenariosList();
  const navigate = useNavigate();
  const { load: loadTale } = useLoadTale();
  const { exportById } = useScenariosExport();
  const { importFromClipboard } = useScenariosImport();
  const catalog = useCatalogClient();
  const discover = useCatalogScenarioList(catalog, { limit: 24 });
  const published = usePublishedCatalogScenarios(catalog);
  const publishLinks = useScenarioPublishLinks();
  const catalogActions = useCatalogActions(catalog);
  const linkByLocalId = useMemo(
    () =>
      new Map(publishLinks.links.map((link) => [link.localScenarioId, link])),
    [publishLinks.links],
  );
  const [generateOpen, setGenerateOpen] = useState(false);
  const [canStartPrivate, setCanStartPrivate] = useState(false);
  const [activeTab, setActiveTab] = useState<ScenarioTab>(
    scenarioTabFromSearch,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<PendingScenarioDelete | null>(null);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
  const setScenarioTab = (value: string) => {
    const next: ScenarioTab =
      value === "discover" || value === "published" ? value : "local";
    setActiveTab(next);
    replaceScenarioTabSearch(next);
  };
  const importScenario = async () => {
    try {
      const scenario = await importFromClipboard();
      navigate({
        to: "/scenarios/new",
        state: (prev) => ({
          ...(prev ?? {}),
          importedScenario: scenario,
        }),
      });
    } catch (_e) {
      toast.error("Failed to import scenario from clipboard");
    }
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await remove(pendingDelete.id);
    setPendingDelete(null);
  };
  const openPublish = async (id: string) => {
    const scenario = await getScenarioById(id);
    if (!scenario) {
      toast.error(t`Scenario not found`);
      return;
    }
    setPendingPublish(scenario);
  };
  const refreshCatalogState = async () => {
    await Promise.all([
      published.refresh(),
      publishLinks.refresh(),
      discover.refresh(),
    ]);
  };
  const startPublicScenario = async (
    scenario: CatalogScenarioRecord,
    syncPolicy?: "default" | "private",
  ) => {
    try {
      const taleId = await catalogActions.start(scenario.id, syncPolicy);
      await loadTale(taleId);
      navigate({ to: "/play" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to start scenario`,
      );
    }
  };
  const viewPublicScenario = (scenario: CatalogCardScenario, owned = false) => {
    navigate({
      to: owned
        ? `/scenarios/catalog/${scenario.id}?owned=1`
        : `/scenarios/catalog/${scenario.id}`,
    });
  };
  const reportPublicScenario = async (scenario: CatalogScenarioRecord) => {
    const reason = window.prompt(t`Report reason`);
    if (!reason?.trim()) return;
    try {
      await catalogActions.report(scenario.id, reason.trim());
      toast.success(t`Report submitted`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to submit report`,
      );
    }
  };
  const unpublishPublicScenario = async (scenario: CatalogScenarioRecord) => {
    try {
      await catalogActions.unpublish(scenario.id);
      toast.success(t`Scenario unpublished`);
      await published.refresh();
      await discover.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Failed to unpublish scenario`,
      );
    }
  };
  const updatePublicThumbnail = async (
    scenario: CatalogScenarioRecord,
    file: File,
  ) => {
    try {
      await catalogActions.updateThumbnail(scenario.id, file);
      toast.success(t`Thumbnail updated`);
      await published.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to update thumbnail`,
      );
    }
  };

  useEffect(() => {
    let disposed = false;
    const refreshPrivateStart = () => {
      canSyncNewTales().then((canSync) => {
        if (!disposed) setCanStartPrivate(canSync);
      });
    };

    refreshPrivateStart();
    const removeListener = addSyncChangedListener(refreshPrivateStart);
    return () => {
      disposed = true;
      removeListener();
    };
  }, []);

  useEffect(() => {
    const catalogAvailabilityPending = Boolean(
      catalog.baseUrl && !catalog.capabilities && !catalog.error,
    );
    if (catalogAvailabilityPending) return;
    if (
      (activeTab === "discover" && !catalog.enabled) ||
      (activeTab === "published" && (!catalog.enabled || !catalog.signedIn))
    ) {
      setActiveTab("local");
      replaceScenarioTabSearch("local");
    }
  }, [
    activeTab,
    catalog.baseUrl,
    catalog.capabilities,
    catalog.enabled,
    catalog.error,
    catalog.signedIn,
  ]);

  const showCatalogControls =
    (activeTab === "discover" && catalog.enabled) ||
    (activeTab === "published" && catalog.enabled && catalog.signedIn);
  const catalogToolbar = activeTab === "published" ? published : discover;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-3 py-4 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate({ to: "/" })}
          >
            <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
          </Button>
          <div className="text-sm text-muted-foreground">
            <span className="text-primary">
              <Trans>Home</Trans>
            </span>
            <span className="px-2">/</span>
            <span>
              <Trans>Scenarios</Trans>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-row">
          <Button onClick={() => navigate({ to: "/scenarios/new" })}>
            <Trans>Create</Trans>
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <Sparkles className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setScenarioTab} className="gap-4">
        <div className="grid gap-2 border-y py-2 md:grid-cols-[22rem_minmax(0,1fr)] md:items-center">
          <TabsList className="h-auto w-full justify-start gap-3 rounded-none bg-transparent p-0 md:w-[22rem]">
            <TabsTrigger
              value="local"
              className="min-w-24 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Trans>Local</Trans>
            </TabsTrigger>
            {catalog.enabled ? (
              <TabsTrigger
                value="discover"
                className="min-w-24 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Trans>Discover</Trans>
              </TabsTrigger>
            ) : null}
            {catalog.enabled && catalog.signedIn ? (
              <TabsTrigger
                value="published"
                className="min-w-24 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Trans>Published</Trans>
              </TabsTrigger>
            ) : null}
          </TabsList>
          {activeTab === "local" ? (
            <div className="flex md:justify-end">
              <Button className="w-full sm:w-auto" onClick={importScenario}>
                <Trans>Import</Trans>
              </Button>
            </div>
          ) : null}
          {showCatalogControls ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 md:justify-self-end md:w-full md:max-w-[34rem]">
              <div className="relative min-w-0">
                <CatalogTagInput
                  value={catalogToolbar.filters.tag ?? []}
                  onChange={(tag) =>
                    catalogToolbar.setFilters((current) => ({
                      ...current,
                      tag,
                    }))
                  }
                  client={catalog}
                  placeholder="Search scenarios or tags"
                />
                {catalogToolbar.loading ? (
                  <Loader2
                    className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground"
                    aria-label={t`Loading scenarios`}
                  />
                ) : null}
              </div>
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t`Sort scenarios`}
                  >
                    <SlidersHorizontalIcon className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="pb-6">
                  <SheetHeader>
                    <SheetTitle>
                      <Trans>Sort scenarios</Trans>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="grid gap-2 px-4">
                    {CATALOG_SORTS.map((sort) => (
                      <Button
                        key={sort}
                        variant={
                          catalogToolbar.filters.sort === sort ||
                          (!catalogToolbar.filters.sort && sort === "popular")
                            ? "default"
                            : "outline"
                        }
                        className="justify-start"
                        onClick={() => {
                          catalogToolbar.setFilters((current) => ({
                            ...current,
                            sort: sort as (typeof CATALOG_SORTS)[number],
                          }));
                          setFilterOpen(false);
                        }}
                      >
                        {sort.replaceAll("_", " ")}
                      </Button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          ) : null}
        </div>
        <TabsContent value="local" className="grid gap-4">
          {loading && (
            <div className="text-sm text-muted-foreground">
              <Trans>Loading...</Trans>
            </div>
          )}
          {Boolean(error) && (
            <div className="text-sm text-destructive">
              <Trans>Failed to load scenarios.</Trans>
            </div>
          )}
          <div className={libraryGridClass}>
            {items.map(({ id, name, description, thumbnail, updatedAt }) => {
              const linked = linkByLocalId.get(id);
              return (
                <Card
                  key={id}
                  className="flex flex-col gap-0 overflow-hidden border-accent/50 p-0 transition-colors hover:border-accent"
                >
                  <CardHeader className="p-0 m-0">
                    <div className="relative">
                      {thumbnail ? (
                        <img
                          src={bytesToObjectUrl(
                            thumbnail as unknown as Uint8Array,
                          )}
                          alt={t`${name} thumbnail`}
                          className="aspect-[2/1] w-full object-cover"
                        />
                      ) : (
                        <img
                          src={placeholderImage}
                          alt={t`${name} thumbnail`}
                          className="aspect-[2/1] w-full object-cover"
                        />
                      )}
                      <div className="absolute right-1.5 top-0.5 z-10">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="secondary"
                              size="icon"
                              className={imageMenuButtonClass}
                              aria-label={t`Scenario actions`}
                            >
                              <MoreHorizontalIcon className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            side="bottom"
                            sideOffset={4}
                          >
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              onClick={() =>
                                navigate({ to: `/scenarios/${id}` })
                              }
                              className="text-xs"
                            >
                              <PencilIcon className="w-4 h-4 me-2" />{" "}
                              <Trans>Edit</Trans>
                            </DropdownMenuItem>
                            {catalog.enabled && catalog.signedIn ? (
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                onClick={() => void openPublish(id)}
                                className="text-xs"
                              >
                                <UploadCloudIcon className="w-4 h-4 me-2" />{" "}
                                {linked ? (
                                  <Trans>Publish update</Trans>
                                ) : (
                                  <Trans>Publish</Trans>
                                )}
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              onClick={() => exportById(id)}
                              className="text-xs"
                            >
                              <ClipboardIcon className="w-4 h-4 me-2" />{" "}
                              <Trans>Export JSON</Trans>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              onClick={() => setPendingDelete({ id, name })}
                              variant="destructive"
                              className="text-xs"
                            >
                              <TrashIcon className="w-4 h-4 me-2" />{" "}
                              <Trans>Delete</Trans>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {linked ? (
                        <Badge
                          className={`absolute bottom-1 left-1 ${imageBadgeClass}`}
                        >
                          <Trans>Published</Trans>
                        </Badge>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            className={`absolute left-1 top-1 ${imageBadgeClass}`}
                          >
                            {formatRelativeTime(updatedAt)}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <Trans>
                            Last updated: {formatExactDateTime(updatedAt)}
                          </Trans>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </CardHeader>
                  <CardContent className={scenarioCardBodyClass}>
                    <span className="line-clamp-1 min-w-0 text-sm font-semibold">
                      {name}
                    </span>
                    <p className="line-clamp-3 min-h-[3.6rem] rounded-xs text-sm leading-snug text-muted-foreground">
                      {description}
                    </p>
                    <div
                      className={
                        canStartPrivate
                          ? "mt-auto grid grid-cols-[1fr_auto] gap-1"
                          : "mt-auto grid"
                      }
                    >
                      <Button
                        size="sm"
                        className={cardActionButtonClass}
                        onClick={async () => {
                          const taleId = await initTaleFromScenario(id);
                          await loadTale(taleId);
                          navigate({ to: "/play" });
                        }}
                      >
                        <Trans>New Tale</Trans>
                      </Button>
                      {canStartPrivate ? (
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={async () => {
                            const taleId = await initTaleFromScenario(id, {
                              syncPolicy: "private",
                            });
                            await loadTale(taleId);
                            navigate({ to: "/play" });
                          }}
                          aria-label={t`Start local-only tale`}
                        >
                          <VenetianMask className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {total > limit && (
            <div className="flex items-center justify-end gap-2 ">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage(Math.max(1, page - 1))}
              >
                <Trans>Prev</Trans>
              </Button>
              <span className="text-sm text-muted-foreground">
                <Trans>
                  Page {page} of {Math.max(1, Math.ceil(total / limit) || 1)}
                </Trans>
              </span>
              <Button
                variant="secondary"
                disabled={page * limit >= total}
                onClick={() => setPage(page + 1)}
              >
                <Trans>Next</Trans>
              </Button>
            </div>
          )}
        </TabsContent>
        {catalog.enabled ? (
          <TabsContent value="discover" className="grid gap-4">
            {discover.error ? (
              <div className="text-sm text-destructive">
                <Trans>Failed to load public scenarios.</Trans>
              </div>
            ) : null}
            <div className={libraryGridClass}>
              {discover.items.map((scenario) => (
                <CatalogScenarioCard
                  key={scenario.id}
                  baseUrl={catalog.baseUrl}
                  scenario={scenario}
                  actions="discover"
                  onView={viewPublicScenario}
                  onStart={(item) => void startPublicScenario(item)}
                  onStartPrivate={
                    canStartPrivate
                      ? (item) => void startPublicScenario(item, "private")
                      : undefined
                  }
                  onReport={reportPublicScenario}
                />
              ))}
            </div>
            {discover.nextCursor ? (
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  disabled={discover.loading}
                  onClick={() => void discover.loadMore()}
                >
                  <Trans>Load more</Trans>
                </Button>
              </div>
            ) : null}
          </TabsContent>
        ) : null}
        {catalog.enabled && catalog.signedIn ? (
          <TabsContent value="published" className="grid gap-4">
            {published.error ? (
              <div className="text-sm text-destructive">
                <Trans>Failed to load published scenarios.</Trans>
              </div>
            ) : null}
            <div className={libraryGridClass}>
              {published.items.map((scenario) => (
                <CatalogScenarioCard
                  key={scenario.id}
                  baseUrl={catalog.baseUrl}
                  scenario={scenario}
                  actions="published"
                  onView={(item) => viewPublicScenario(item, true)}
                  onUnpublish={unpublishPublicScenario}
                  onThumbnail={
                    catalog.thumbnailUploads ? updatePublicThumbnail : undefined
                  }
                />
              ))}
            </div>
            {published.nextCursor ? (
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  disabled={published.loading}
                  onClick={() => void published.loadMore()}
                >
                  <Trans>Load more</Trans>
                </Button>
              </div>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete this scenario?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                This will permanently delete {pendingDelete?.name}. This action
                cannot be undone.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trans>Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PublishScenarioDialog
        open={Boolean(pendingPublish)}
        scenario={pendingPublish}
        updating={Boolean(
          pendingPublish && linkByLocalId.get(pendingPublish.id),
        )}
        thumbnailUploads={catalog.thumbnailUploads}
        catalog={catalog}
        onOpenChange={(open) => {
          if (!open) setPendingPublish(null);
        }}
        onPublish={async ({ metadata, thumbnailFile }) => {
          if (!pendingPublish) return;
          try {
            const result = await catalogActions.publish({
              scenario: pendingPublish,
              metadata,
              thumbnailFile,
            });
            toast.success(
              result.moderation.status === "needs_review"
                ? t`Scenario submitted for moderation`
                : linkByLocalId.get(pendingPublish.id)
                  ? t`Scenario update published`
                  : t`Scenario published`,
            );
            await refreshCatalogState();
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : t`Failed to publish scenario`,
            );
            throw error;
          }
        }}
      />
      <GenerateScenarioDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={(scenario) => {
          navigate({
            to: "/scenarios/new",
            state: (prev) => ({
              ...(prev ?? {}),
              importedScenario: scenario,
            }),
          });
        }}
      />
    </div>
  );
}
