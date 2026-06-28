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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  ClipboardIcon,
  FlagIcon,
  Sparkles,
  UploadCloudIcon,
  VenetianMask,
} from "lucide-react";
import placeholderImage from "@/assets/scen-ph.png";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CATALOG_CATEGORIES,
  CATALOG_SORTS,
  type CatalogScenarioDetail,
  type CatalogScenarioRecord,
} from "@/types/catalog.type";
import { getScenarioById } from "@/services/scenario.service";
import type { Scenario } from "@/types/context.type";

type PendingScenarioDelete = {
  id: string;
  name: string;
};

const catalogFilterControlClass =
  "h-9 rounded-full border-border/60 bg-muted/40 px-4 shadow-none hover:bg-muted/70 focus-visible:ring-1";

function catalogAssetUrl(baseUrl: string, path: string | null | undefined) {
  if (!path) return placeholderImage;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}${path}`;
}

function CatalogScenarioCard({
  baseUrl,
  scenario,
  actions,
  onView,
  onStart,
  onReport,
  onUnpublish,
  onThumbnail,
}: {
  baseUrl: string;
  scenario: CatalogScenarioRecord;
  actions: "discover" | "published";
  onView?: (scenario: CatalogScenarioRecord) => void;
  onStart?: (scenario: CatalogScenarioRecord) => void;
  onReport?: (scenario: CatalogScenarioRecord) => void;
  onUnpublish?: (scenario: CatalogScenarioRecord) => void;
  onThumbnail?: (scenario: CatalogScenarioRecord, file: File) => void;
}) {
  return (
    <Card className="flex flex-col gap-1 pt-0 pb-2 border-accent/50">
      <CardHeader className="p-0 m-0">
        <div className="relative">
          <img
            src={catalogAssetUrl(baseUrl, scenario.thumbnail?.downloadUrl)}
            alt={`${scenario.title} thumbnail`}
            className="h-48 w-full object-cover"
          />
          {actions === "published" ? (
            <Badge className="absolute left-1 top-1 bg-background/80 text-xs text-foreground">
              {scenario.status}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex h-44 flex-col gap-2 px-2">
        <div className="flex items-center gap-2">
          <span className="line-clamp-1 min-w-0 flex-1 text-sm font-semibold">
            {scenario.title}
          </span>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {scenario.category.replaceAll("_", " ")}
          </Badge>
        </div>
        <p className="line-clamp-3 min-h-0 flex-1 text-sm text-muted-foreground">
          {scenario.summary}
        </p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{scenario.author.displayName}</span>
          <span className="shrink-0">{scenario.startCount} starts</span>
        </div>
        {actions === "discover" ? (
          <div className="mt-auto grid grid-cols-[auto_1fr_auto] gap-1">
            <Button variant="outline" onClick={() => onView?.(scenario)}>
              <Trans>View</Trans>
            </Button>
            <Button onClick={() => onStart?.(scenario)}>
              <Trans>Start Tale</Trans>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onReport?.(scenario)}
              aria-label="Report scenario"
            >
              <FlagIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="mt-auto flex flex-wrap gap-1">
            {onThumbnail ? (
              <Button asChild variant="outline" size="sm">
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
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUnpublish?.(scenario)}
            >
              <Trans>Unpublish</Trans>
            </Button>
          </div>
        )}
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
  const [pendingDelete, setPendingDelete] =
    useState<PendingScenarioDelete | null>(null);
  const [pendingPublish, setPendingPublish] = useState<Scenario | null>(null);
  const [viewingCatalog, setViewingCatalog] =
    useState<CatalogScenarioDetail | null>(null);
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
  const viewPublicScenario = async (scenario: CatalogScenarioRecord) => {
    try {
      setViewingCatalog(await catalogActions.view(scenario.id));
      await discover.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to load scenario`,
      );
    }
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

  return (
    <div className="mx-auto w-full max-w-screen-2xl py-5 flex flex-col gap-4 px-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          {/* back button */}
          <Button
            variant="default"
            onClick={() => navigate({ to: "/" })}
            className="mt-1.5"
          >
            <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
          </Button>
          <div className="flex flex-col">
            <Label className="text-xl">
              <Trans>Scenarios</Trans>
            </Label>
            <span className="text-sm text-muted-foreground">
              <Trans>Browse and manage your scenarios</Trans>
            </span>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <Button
            onClick={async () => {
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
            }}
          >
            <Trans>Import</Trans>
          </Button>

          <Button onClick={() => navigate({ to: "/scenarios/new" })}>
            <Trans>Create</Trans>
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <Sparkles className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Separator />
      <Tabs defaultValue="local" className="gap-4">
        <TabsList className="h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="local"
            className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Trans>Local</Trans>
          </TabsTrigger>
          {catalog.enabled ? (
            <TabsTrigger
              value="discover"
              className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Trans>Discover</Trans>
            </TabsTrigger>
          ) : null}
          {catalog.enabled && catalog.signedIn ? (
            <TabsTrigger
              value="published"
              className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Trans>Published</Trans>
            </TabsTrigger>
          ) : null}
        </TabsList>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map(({ id, name, description, thumbnail, updatedAt }) => {
              const linked = linkByLocalId.get(id);
              return (
                <Card
                  key={id}
                  className="flex flex-col gap-1 pt-0 pb-2 border-accent/50"
                >
                  <CardHeader className="p-0 m-0">
                    <div className="relative">
                      {thumbnail ? (
                        <img
                          src={bytesToObjectUrl(
                            thumbnail as unknown as Uint8Array,
                          )}
                          alt={t`${name} thumbnail`}
                          className="h-48 w-full object-cover"
                        />
                      ) : (
                        <img
                          src={placeholderImage}
                          alt={t`${name} thumbnail`}
                          className="h-48 w-full object-cover"
                        />
                      )}
                      <div className="absolute right-1.5 top-0.5 z-10">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-6 w-6 rounded-full pb-1.5 bg-accent/50"
                              aria-label={t`Scenario actions`}
                            >
                              ...
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
                        <Badge className="absolute bottom-1 left-1 text-xs bg-accent/80 text-accent-foreground">
                          <Trans>Published</Trans>
                        </Badge>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="absolute top-1 left-1 text-xs text-muted-foreground bg-accent/50">
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
                  <CardContent className="flex h-36 flex-col gap-2 px-2">
                    <span className="line-clamp-2 min-h-9 text-sm font-semibold leading-snug">
                      {name}
                    </span>
                    <p className="line-clamp-3 min-h-0 flex-1 rounded-xs text-sm text-muted-foreground">
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
                          size="icon"
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
            <div className="flex flex-wrap items-center gap-2 border-b pb-4">
              <Select
                value={discover.filters.sort ?? "popular"}
                onValueChange={(sort) =>
                  discover.setFilters((current) => ({
                    ...current,
                    sort: sort as (typeof CATALOG_SORTS)[number],
                  }))
                }
              >
                <SelectTrigger className={`${catalogFilterControlClass} w-36`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  {CATALOG_SORTS.map((sort) => (
                    <SelectItem key={sort} value={sort}>
                      {sort.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={discover.filters.category ?? "all"}
                onValueChange={(category) =>
                  discover.setFilters((current) => ({
                    ...current,
                    category: category === "all" ? undefined : category,
                  }))
                }
              >
                <SelectTrigger className={`${catalogFilterControlClass} w-40`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  <SelectItem value="all">
                    <Trans>All categories</Trans>
                  </SelectItem>
                  {CATALOG_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className={`${catalogFilterControlClass} w-48`}
                value={discover.filters.tag?.join(", ") ?? ""}
                placeholder="tag"
                onChange={(event) =>
                  discover.setFilters((current) => ({
                    ...current,
                    tag: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
            {discover.loading ? (
              <div className="text-sm text-muted-foreground">
                <Trans>Loading...</Trans>
              </div>
            ) : null}
            {discover.error ? (
              <div className="text-sm text-destructive">
                <Trans>Failed to load public scenarios.</Trans>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {discover.items.map((scenario) => (
                <CatalogScenarioCard
                  key={scenario.id}
                  baseUrl={catalog.baseUrl}
                  scenario={scenario}
                  actions="discover"
                  onView={viewPublicScenario}
                  onStart={(item) => void startPublicScenario(item)}
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
            {published.loading ? (
              <div className="text-sm text-muted-foreground">
                <Trans>Loading...</Trans>
              </div>
            ) : null}
            {published.error ? (
              <div className="text-sm text-destructive">
                <Trans>Failed to load published scenarios.</Trans>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {published.items.map((scenario) => (
                <CatalogScenarioCard
                  key={scenario.id}
                  baseUrl={catalog.baseUrl}
                  scenario={scenario}
                  actions="published"
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
      <Dialog
        open={Boolean(viewingCatalog)}
        onOpenChange={(open) => {
          if (!open) setViewingCatalog(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewingCatalog?.title}</DialogTitle>
            <DialogDescription>
              {viewingCatalog?.author.displayName}
              {viewingCatalog?.publishedAt
                ? ` - ${formatExactDateTime(Date.parse(viewingCatalog.publishedAt))}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {viewingCatalog ? (
            <div className="grid gap-4">
              <img
                src={catalogAssetUrl(
                  catalog.baseUrl,
                  viewingCatalog.thumbnail?.downloadUrl,
                )}
                alt={`${viewingCatalog.title} thumbnail`}
                className="max-h-64 w-full object-cover"
              />
              <p className="text-sm text-muted-foreground">
                {viewingCatalog.summary}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {viewingCatalog.category.replaceAll("_", " ")}
                </Badge>
                <Badge variant="outline">{viewingCatalog.language}</Badge>
                <Badge variant="outline">{viewingCatalog.ageRating}</Badge>
                {viewingCatalog.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
              <Button
                onClick={() => {
                  const scenario = viewingCatalog;
                  setViewingCatalog(null);
                  void startPublicScenario(scenario);
                }}
              >
                <Trans>Start Tale</Trans>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
        onOpenChange={(open) => {
          if (!open) setPendingPublish(null);
        }}
        onPublish={async ({ metadata, thumbnailFile }) => {
          if (!pendingPublish) return;
          try {
            await catalogActions.publish({
              scenario: pendingPublish,
              metadata,
              thumbnailFile,
            });
            toast.success(
              linkByLocalId.get(pendingPublish.id)
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
