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
import { Input } from "@/components/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { useTaleLibrary } from "@/hooks/useTaleLibrary";
import { useLoadTale } from "@/hooks/useGameSaves";
import { TaleConflictDialog } from "@/components/tales/tale-conflict-dialog";
import {
  bytesToObjectUrl,
  formatExactDateTime,
  formatRelativeTime,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeftIcon,
  Cloud,
  CloudOff,
  CloudUpload,
  FilePlus2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
  VenetianMask,
} from "lucide-react";
import { toast } from "sonner";
import placeholderImage from "@/assets/scen-ph.png";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { LibraryTaleItem } from "@/lib/tale-library";
import type { TaleConflictChoice } from "@/hooks/useTaleLibrary";
import { imageBadgeClass, imageMenuButtonClass } from "@/lib/card-badges";

type PendingTaleDelete = {
  item: LibraryTaleItem;
  name: string;
};

type PendingCloudRemove = {
  item: LibraryTaleItem;
  name: string;
};

const libraryGridClass =
  "grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]";
const cardActionButtonClass = "h-8";

export default function TalesHome() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const [pendingDelete, setPendingDelete] = useState<PendingTaleDelete | null>(
    null,
  );
  const [pendingCloudRemove, setPendingCloudRemove] =
    useState<PendingCloudRemove | null>(null);
  const [search, setSearch] = useState("");
  const [conflictItem, setConflictItem] = useState<LibraryTaleItem | null>(
    null,
  );
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const { load: loadResolvedTale } = useLoadTale();
  const {
    items,
    loading,
    error,
    remoteError,
    syncActive,
    syncStatesLoading,
    loadIntoGame,
    page,
    limit,
    total,
    setPage,
    deleteLibraryTale,
    removeLibraryTaleFromCloud,
    resolveConflict,
    saveAsScenario,
    syncLibraryTale,
  } = useTaleLibrary();

  const handleClickDelete = (tale: PendingTaleDelete) => {
    setPendingDelete(tale);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteLibraryTale(pendingDelete.item);
      toast.success(t`Tale deleted`);
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Delete failed`);
    }
  };

  const confirmCloudRemove = async () => {
    if (!pendingCloudRemove) return;
    try {
      await removeLibraryTaleFromCloud(pendingCloudRemove.item);
      toast.success(t`Removed from cloud`);
      setPendingCloudRemove(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to remove from cloud`,
      );
    }
  };

  const handleSyncToCloud = async (item: LibraryTaleItem) => {
    try {
      await syncLibraryTale(item);
      toast.success(t`Sync queued`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to queue sync`,
      );
    }
  };

  const handleSaveAsScenario = async (id: string) => {
    await saveAsScenario(id);
  };

  const handleLoad = async (item: LibraryTaleItem) => {
    if (item.source === "local" && item.sync?.status === "conflict") {
      setConflictItem(item);
      return;
    }
    await loadIntoGame(item);
    navigate({ to: "/play" });
  };

  const handleResolveConflict = async (choice: TaleConflictChoice) => {
    if (!conflictItem || conflictItem.source !== "local") return;
    setResolvingConflict(true);
    try {
      const taleId = await resolveConflict(conflictItem, choice);
      await loadResolvedTale(taleId);
      setConflictItem(null);
      toast.success(t`Conflict resolved`);
      navigate({ to: "/play" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to resolve conflict`,
      );
    } finally {
      setResolvingConflict(false);
    }
  };

  const query = search.trim().toLowerCase();
  const visibleItems = query
    ? items.filter((item) => {
        const text =
          item.source === "remote"
            ? [
                item.remoteTale.title,
                item.remoteTale.description,
                item.remoteTale.lastEntryPreview,
              ].join(" ")
            : [
                item.localTale.name,
                item.localTale.description,
                item.localTale.lastLogEntry?.text,
              ].join(" ");
        return text.toLowerCase().includes(query);
      })
    : items;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-3 py-4 sm:px-4 lg:px-6">
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
            <Trans>Tales</Trans>
          </span>
        </div>
      </div>
      <div className="border-y py-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t`Search tales`}
          className="max-w-md"
        />
      </div>
      {loading && (
        <div className="text-sm text-muted-foreground">
          <Trans>Loading...</Trans>
        </div>
      )}
      {Boolean(error) && (
        <div className="text-sm text-destructive">
          <Trans>Failed to load tales.</Trans>
        </div>
      )}
      {Boolean(remoteError) && (
        <div className="text-sm text-muted-foreground">
          <Trans>Cloud tales are unavailable.</Trans>
        </div>
      )}
      <div className={libraryGridClass}>
        {visibleItems.map((item) => {
          const isRemote = item.source === "remote";
          const id = isRemote ? item.remoteTale.id : item.localTale.id;
          const name = isRemote ? item.remoteTale.title : item.localTale.name;
          const description = isRemote
            ? (item.remoteTale.lastEntryPreview ??
              item.remoteTale.description ??
              "")
            : (item.localTale.lastLogEntry?.text ??
              item.localTale.description ??
              "");
          const thumbnail = isRemote ? null : item.localTale.thumbnail;
          const scenarioHead = isRemote ? null : item.localTale.scenarioHead;
          const updatedAt = isRemote
            ? Date.parse(item.remoteTale.updatedAt) || 0
            : item.localTale.updatedAt;
          const entryCount = isRemote
            ? (item.remoteTale.entryCount ?? item.remoteTale.turnCount)
            : item.localTale.logCount;
          const hasConflict =
            syncActive &&
            item.source === "local" &&
            item.sync?.status === "conflict";
          const isSynced =
            syncActive && (isRemote || Boolean(!isRemote && item.sync));
          const syncStatusUnknown =
            syncActive &&
            item.source === "local" &&
            !item.sync &&
            syncStatesLoading;
          const statusLabel = hasConflict
            ? t`Needs review`
            : isSynced
              ? t`Cloud`
              : t`Local`;
          return (
            <Card
              key={isRemote ? `remote-${id}` : `local-${id}`}
              className="flex flex-col gap-0 overflow-hidden border-accent/50 p-0 transition-colors hover:border-accent"
            >
              <CardHeader className="p-0 m-0">
                <div className="relative">
                  {thumbnail ? (
                    <img
                      src={bytesToObjectUrl(thumbnail as unknown as Uint8Array)}
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
                          aria-label={t`Tale actions`}
                        >
                          <MoreHorizontalIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        sideOffset={4}
                      >
                        {!isRemote && scenarioHead?.id && (
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() =>
                              navigate({
                                to: `/scenarios/${scenarioHead?.id}`,
                              })
                            }
                            className="text-xs"
                          >
                            <PencilIcon className="w-4 h-4 me-2" />{" "}
                            <Trans>Scenario</Trans>
                          </DropdownMenuItem>
                        )}
                        {!isRemote && !scenarioHead?.id && (
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() => handleSaveAsScenario(id)}
                            className="text-xs"
                          >
                            <FilePlus2Icon className="w-4 h-4 me-2" />{" "}
                            <Trans>Save as Scenario</Trans>
                          </DropdownMenuItem>
                        )}
                        {syncActive && isSynced ? (
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() =>
                              setPendingCloudRemove({ item, name })
                            }
                            className="text-xs"
                          >
                            <CloudOff className="w-4 h-4 me-2" />{" "}
                            <Trans>Remove from cloud</Trans>
                          </DropdownMenuItem>
                        ) : null}
                        {syncActive &&
                        !isRemote &&
                        !item.sync &&
                        !syncStatusUnknown ? (
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() => void handleSyncToCloud(item)}
                            className="text-xs"
                          >
                            <CloudUpload className="w-4 h-4 me-2" />{" "}
                            <Trans>Sync to cloud</Trans>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => handleClickDelete({ item, name })}
                          variant="destructive"
                          className="text-xs"
                        >
                          <TrashIcon className="w-4 h-4 me-2" />{" "}
                          <Trans>Delete</Trans>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        className={`absolute left-1 top-1 ${imageBadgeClass}`}
                      >
                        {formatRelativeTime(updatedAt)} - {entryCount}{" "}
                        {entryCount === 1 ? t`entry` : t`entries`}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <Trans>
                        Last played: {formatExactDateTime(updatedAt)}
                      </Trans>
                    </TooltipContent>
                  </Tooltip>
                  {syncActive && !syncStatusUnknown ? (
                    <Badge
                      className={`absolute bottom-1 right-1 ${imageBadgeClass}`}
                      aria-label={statusLabel}
                    >
                      {hasConflict ? (
                        <Trans>Needs review</Trans>
                      ) : isSynced ? (
                        <Cloud className="size-3" />
                      ) : (
                        <VenetianMask className="size-3" />
                      )}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2 p-3">
                <span className="line-clamp-1 min-w-0 text-sm font-semibold">
                  {name}
                </span>
                <p className="line-clamp-3 min-h-[3.6rem] flex-1 rounded-xs text-sm leading-snug text-muted-foreground">
                  {description}
                </p>

                <Button
                  size="sm"
                  onClick={() => handleLoad(item)}
                  className={`mt-auto w-full ${cardActionButtonClass}`}
                >
                  <Trans>Load Tale</Trans>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <TaleConflictDialog
        item={conflictItem}
        open={Boolean(conflictItem)}
        resolving={resolvingConflict}
        onOpenChange={(open) => {
          if (!open && !resolvingConflict) setConflictItem(null);
        }}
        onResolve={handleResolveConflict}
      />
      {total > limit && (
        <div className="flex items-center justify-end gap-2">
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
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete this tale?</Trans>
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
      <AlertDialog
        open={Boolean(pendingCloudRemove)}
        onOpenChange={(open) => {
          if (!open) setPendingCloudRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Remove from cloud?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                This keeps the tale on this device and removes it from cloud
                sync.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloudRemove}>
              <Trans>Remove from cloud</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
