import { Button } from "@/components/ui/button";
import { ScenarioBreadcrumb } from "@/components/scenario/ScenarioBreadcrumb";
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
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  useScenariosList,
  useScenariosExport,
  useScenariosImport,
} from "@/hooks/useScenarios";
import { bytesToObjectUrl } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftIcon,
  BanIcon,
  PencilIcon,
  TrashIcon,
  ClipboardIcon,
  FlagIcon,
  Loader2,
  MoreHorizontalIcon,
  Sparkles,
  UploadCloudIcon,
} from "lucide-react";
import placeholderImage from "@/assets/scen-ph.png";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  GenerateScenarioDialog,
  PublishScenarioDialog,
  ScenarioPreviewCard,
} from "@/components/scenario";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCatalogActions,
  useCatalogClient,
  useCatalogScenarioList,
  usePublishedCatalogScenarios,
  useScenarioPublishLinks,
} from "@/hooks/useCatalogScenarios";
import {
  type CatalogSort,
  type CatalogOwnedScenarioRecord,
  type CatalogScenarioRecord,
} from "@/types/catalog.type";
import { getScenarioById } from "@/services/scenario.service";
import type { Scenario } from "@/types/context.type";
import { CatalogTagInput } from "@/components/catalog/CatalogTagInput";
import { CatalogTags } from "@/components/catalog/CatalogTags";
import {
  catalogBrowseSearch,
  readCatalogBrowseSearch,
  type CatalogBrowseState,
  type ScenarioTab,
} from "@/lib/catalog-browse";
import { imageBadgeClass, imageMenuButtonClass } from "@/lib/card-badges";

type PendingScenarioDelete = {
  id: string;
  name: string;
};

type CatalogCardScenario = CatalogScenarioRecord | CatalogOwnedScenarioRecord;

const libraryGridClass =
  "grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]";
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

function CatalogScenarioCard({
  baseUrl,
  scenario,
  actions,
  onView,
  onReport,
  onBlockPublisher,
  onUnpublish,
  onEdit,
  onTag,
}: {
  baseUrl: string;
  scenario: CatalogCardScenario;
  actions: "discover" | "published";
  onView?: (scenario: CatalogCardScenario) => void;
  onReport?: (scenario: CatalogCardScenario) => void;
  onBlockPublisher?: (scenario: CatalogCardScenario) => void;
  onUnpublish?: (scenario: CatalogCardScenario) => void;
  onEdit?: () => void;
  onTag: (tag: string) => void;
}) {
  const isModerationHidden = hiddenByModeration(scenario);
  const isAwaitingModeration = awaitingModeration(scenario);

  return (
    <ScenarioPreviewCard
      title={scenario.title}
      summary={scenario.summary}
      imageSrc={catalogAssetUrl(baseUrl, scenario.thumbnail?.downloadUrl)}
      imageAlt={`${scenario.title} thumbnail`}
      ariaLabel={`View ${scenario.title}`}
      actionLabel={<Trans>Explore scenario</Trans>}
      imageBadges={
        <>
          <Badge className={`${imageBadgeClass} max-w-full`}>
            <span className="truncate">{scenario.author.displayName}</span>
          </Badge>
          {isModerationHidden ? (
            <Badge className={imageBadgeClass}>
              <Trans>Hidden</Trans>
            </Badge>
          ) : isAwaitingModeration ? (
            <Badge className={imageBadgeClass}>
              <Trans>In review</Trans>
            </Badge>
          ) : null}
        </>
      }
      menu={
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
            {actions === "discover" && onBlockPublisher ? (
              <DropdownMenuItem onClick={() => onBlockPublisher(scenario)}>
                <BanIcon className="h-4 w-4" />
                <Trans>Block publisher</Trans>
              </DropdownMenuItem>
            ) : null}
            {actions === "published" && onEdit ? (
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon className="h-4 w-4" />
                <Trans>Edit scenario</Trans>
              </DropdownMenuItem>
            ) : null}
            {actions === "published" ? (
              <DropdownMenuItem onClick={() => onUnpublish?.(scenario)}>
                <Trans>Unpublish</Trans>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      }
      footer={<CatalogTags tags={scenario.tags} onSelect={onTag} />}
      onOpen={() => onView?.(scenario)}
    />
  );
}

export default function ScenariosHome() {
  const { t } = useLingui();
  const {
    items,
    loading,
    error,
    page,
    limit,
    total,
    setPage,
    remove,
    refresh: refreshLocal,
  } = useScenariosList();
  const navigate = useNavigate();
  const { search: routeSearch } = useLocation();
  const browse = useMemo(
    () => readCatalogBrowseSearch(routeSearch),
    [routeSearch],
  );
  const activeTab = browse.tab;
  const filters = useMemo(
    () => ({ limit: 24, q: browse.q, tag: browse.tag, sort: browse.sort }),
    [browse],
  );
  const updateBrowse = useCallback(
    (updates: Partial<CatalogBrowseState>) => {
      void navigate({
        to: "/scenarios",
        search: catalogBrowseSearch({ ...browse, ...updates }),
        replace: true,
        resetScroll: false,
      });
    },
    [browse, navigate],
  );
  const { exportById } = useScenariosExport();
  const { importFromClipboard } = useScenariosImport();
  const catalog = useCatalogClient();
  const discover = useCatalogScenarioList(
    { ...catalog, enabled: catalog.enabled && activeTab === "discover" },
    {},
    filters,
  );
  const published = usePublishedCatalogScenarios(
    { ...catalog, enabled: catalog.enabled && activeTab === "published" },
    {},
    filters,
  );
  const latestCatalogRefresh = useRef({
    discover: discover.refresh,
    published: published.refresh,
  });
  // A mutation can finish after the user has changed the active filters.
  latestCatalogRefresh.current = {
    discover: discover.refresh,
    published: published.refresh,
  };
  const publishLinks = useScenarioPublishLinks();
  const catalogActions = useCatalogActions(catalog);
  const linkByLocalId = useMemo(
    () =>
      new Map(publishLinks.links.map((link) => [link.localScenarioId, link])),
    [publishLinks.links],
  );
  const [generateOpen, setGenerateOpen] = useState(false);
  const [tagInputKey, setTagInputKey] = useState(0);
  const [pendingDelete, setPendingDelete] =
    useState<PendingScenarioDelete | null>(null);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
  const setScenarioTab = (value: string) => {
    const next: ScenarioTab =
      value === "discover" || value === "published" ? value : "local";
    updateBrowse({
      tab: next,
      sort: next === "published" ? "updated" : "newest",
    });
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
      latestCatalogRefresh.current.published(),
      publishLinks.refresh(),
      latestCatalogRefresh.current.discover(),
      refreshLocal(),
    ]);
  };
  const viewPublicScenario = (scenario: CatalogCardScenario, owned = false) => {
    navigate({
      to: `/scenarios/catalog/${scenario.id}`,
      search: {
        ...catalogBrowseSearch(browse),
        owned: owned ? "1" : undefined,
      },
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
  const blockPublicScenarioPublisher = async (
    scenario: CatalogScenarioRecord,
  ) => {
    if (
      !window.confirm(
        t`Block ${scenario.author.displayName}? You will no longer see their scenarios.`,
      )
    ) {
      return;
    }
    try {
      await catalogActions.blockPublisher(scenario.author.id);
      setTagInputKey((key) => key + 1);
      toast.success(t`Publisher blocked`);
      await latestCatalogRefresh.current.discover();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to block publisher`,
      );
    }
  };
  const unpublishPublicScenario = async (scenario: CatalogScenarioRecord) => {
    try {
      await catalogActions.unpublish(scenario.id);
      toast.success(t`Scenario unpublished`);
      await latestCatalogRefresh.current.published();
      await latestCatalogRefresh.current.discover();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Failed to unpublish scenario`,
      );
    }
  };

  useEffect(() => {
    const catalogAvailabilityPending = Boolean(
      catalog.baseUrl && !catalog.capabilities && !catalog.error,
    );
    if (catalogAvailabilityPending) return;
    if (
      (activeTab === "discover" && !catalog.enabled) ||
      (activeTab === "published" && (!catalog.enabled || !catalog.signedIn))
    ) {
      updateBrowse({ tab: "local" });
    }
  }, [
    activeTab,
    catalog.baseUrl,
    catalog.capabilities,
    catalog.enabled,
    catalog.error,
    catalog.signedIn,
    updateBrowse,
  ]);

  const showCatalogControls =
    (activeTab === "discover" && catalog.enabled) ||
    (activeTab === "published" && catalog.enabled && catalog.signedIn);
  const catalogToolbar = activeTab === "published" ? published : discover;
  const hasFilters = Boolean(browse.q.trim() || browse.tag.length);
  const filterByTag = (tag: string) => {
    if (!browse.tag.includes(tag))
      updateBrowse({ tag: [...browse.tag, tag].slice(0, 16) });
  };
  const clearFilters = () => {
    setTagInputKey((key) => key + 1);
    updateBrowse({ q: "", tag: [] });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate({ to: "/" })}
            aria-label={t`Home`}
          >
            <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
          </Button>
          <ScenarioBreadcrumb
            to="/"
            parent={<Trans>Home</Trans>}
            current={
              <h1 className="text-sm font-normal">
                <Trans>Scenarios</Trans>
              </h1>
            }
          />
        </div>
        {activeTab === "local" || catalog.signedIn ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => navigate({ to: "/scenarios/new" })}>
              <Trans>Create</Trans>
            </Button>
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="w-4 h-4" />
              <Trans>Generate</Trans>
            </Button>
          </div>
        ) : null}
      </header>

      <Tabs value={activeTab} onValueChange={setScenarioTab} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <TabsList className="h-auto max-w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
            <TabsTrigger
              value="local"
              className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Trans>Local</Trans>
            </TabsTrigger>
            {catalog.enabled ? (
              <TabsTrigger
                value="discover"
                className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Trans>Discover</Trans>
              </TabsTrigger>
            ) : null}
            {catalog.enabled && catalog.signedIn ? (
              <TabsTrigger
                value="published"
                className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Trans>Published</Trans>
              </TabsTrigger>
            ) : null}
          </TabsList>
          {activeTab === "local" ? (
            <div className="flex">
              <Button variant="outline" onClick={importScenario}>
                <Trans>Import</Trans>
              </Button>
            </div>
          ) : null}
          {showCatalogControls ? (
            <div className="grid w-full gap-2">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    type="search"
                    value={browse.q}
                    maxLength={200}
                    placeholder={t`Search scenarios`}
                    aria-label={t`Search scenarios`}
                    className="pe-9"
                    onChange={(event) =>
                      updateBrowse({ q: event.target.value })
                    }
                  />
                  {catalogToolbar.loading && (
                    <Loader2
                      className="pointer-events-none absolute end-2 top-2.5 size-4 animate-spin text-muted-foreground"
                      aria-label={t`Loading scenarios`}
                    />
                  )}
                </div>
                <Select
                  value={browse.sort}
                  onValueChange={(sort) =>
                    updateBrowse({ sort: sort as CatalogSort })
                  }
                >
                  <SelectTrigger
                    aria-label={t`Sort scenarios`}
                    className="w-32"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">
                      <Trans>New</Trans>
                    </SelectItem>
                    <SelectItem value="popular">
                      <Trans>Popular</Trans>
                    </SelectItem>
                    {(activeTab === "published" ||
                      browse.sort === "updated") && (
                      <SelectItem value="updated">
                        <Trans>Updated</Trans>
                      </SelectItem>
                    )}
                    {browse.sort === "most_started" && (
                      <SelectItem value="most_started">
                        <Trans>Most started</Trans>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <CatalogTagInput
                    key={`${activeTab}-${tagInputKey}`}
                    value={browse.tag}
                    onChange={(tag) => updateBrowse({ tag })}
                    search={browse.q}
                    client={catalog}
                    placeholder={t`Filter by tags`}
                    aria-label={t`Filter by tags`}
                  />
                </div>
                {hasFilters && (
                  <Button variant="ghost" onClick={clearFilters}>
                    <Trans>Clear filters</Trans>
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
        {showCatalogControls &&
          !catalogToolbar.error &&
          catalogToolbar.items.length === 0 && (
            <p
              role="status"
              className="py-8 text-center text-sm text-muted-foreground"
            >
              {catalogToolbar.loading ? (
                <Trans>Loading scenarios</Trans>
              ) : hasFilters ? (
                <Trans>No scenarios match your search or tags.</Trans>
              ) : activeTab === "published" ? (
                <Trans>No published scenarios yet.</Trans>
              ) : (
                <Trans>No public scenarios yet.</Trans>
              )}
            </p>
          )}
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
            {items.map(({ id, name, description, thumbnail }) => {
              const linked = linkByLocalId.get(id);
              return (
                <ScenarioPreviewCard
                  key={id}
                  title={name}
                  summary={description || t`No description yet.`}
                  imageSrc={
                    thumbnail
                      ? bytesToObjectUrl(thumbnail as unknown as Uint8Array)
                      : placeholderImage
                  }
                  imageAlt={t`${name} thumbnail`}
                  ariaLabel={t`View ${name}`}
                  actionLabel={<Trans>Explore scenario</Trans>}
                  imageBadges={
                    linked ? (
                      <Badge className={imageBadgeClass}>
                        <Trans>Published</Trans>
                      </Badge>
                    ) : null
                  }
                  menu={
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
                            navigate({ to: `/scenarios/${id}/edit` })
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
                  }
                  onOpen={() => navigate({ to: `/scenarios/${id}` })}
                />
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
                <Button variant="link" onClick={() => void discover.refresh()}>
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : null}
            <div className={libraryGridClass}>
              {discover.items.map((scenario) => (
                <CatalogScenarioCard
                  key={scenario.id}
                  baseUrl={catalog.baseUrl}
                  scenario={scenario}
                  actions="discover"
                  onTag={filterByTag}
                  onView={viewPublicScenario}
                  onReport={reportPublicScenario}
                  onBlockPublisher={
                    catalog.signedIn ? blockPublicScenarioPublisher : undefined
                  }
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
                <Button variant="link" onClick={() => void published.refresh()}>
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : null}
            <div className={libraryGridClass}>
              {published.items.map((scenario) => {
                const link = publishLinks.links.find(
                  (item) => item.catalogScenarioId === scenario.id,
                );
                return (
                  <CatalogScenarioCard
                    key={scenario.id}
                    baseUrl={catalog.baseUrl}
                    scenario={scenario}
                    actions="published"
                    onTag={filterByTag}
                    onView={(item) => viewPublicScenario(item, true)}
                    onUnpublish={unpublishPublicScenario}
                    onEdit={
                      link
                        ? () =>
                            void navigate({
                              to: `/scenarios/${link.localScenarioId}/edit`,
                            })
                        : undefined
                    }
                  />
                );
              })}
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
        onEdit={() => {
          if (!pendingPublish) return;
          void navigate({ to: `/scenarios/${pendingPublish.id}/edit` });
          setPendingPublish(null);
        }}
        onPublish={async (input) => {
          if (!pendingPublish) return;
          try {
            const result = await catalogActions.publish(input);
            toast.success(
              result.moderation.status === "needs_review"
                ? t`Scenario submitted for moderation`
                : linkByLocalId.get(pendingPublish.id)
                  ? t`Scenario update published`
                  : t`Scenario published`,
            );
            setPendingPublish(null);
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
    </main>
  );
}
