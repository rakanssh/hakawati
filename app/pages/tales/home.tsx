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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  FilePlus2Icon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import placeholderImage from "@/assets/scen-ph.png";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { LibraryTaleItem } from "@/lib/tale-library";
import type { TaleConflictChoice } from "@/hooks/useTaleLibrary";

type PendingTaleDelete = {
  item: LibraryTaleItem;
  name: string;
};

export default function TalesHome() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const [pendingDelete, setPendingDelete] = useState<PendingTaleDelete | null>(
    null,
  );
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
    loadIntoGame,
    page,
    limit,
    total,
    setPage,
    deleteLibraryTale,
    resolveConflict,
    saveAsScenario,
  } = useTaleLibrary();

  const handleClickDelete = (tale: PendingTaleDelete) => {
    setPendingDelete(tale);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteLibraryTale(pendingDelete.item);
    setPendingDelete(null);
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
    <div className="mx-auto w-full max-w-screen-2xl py-5 flex flex-col gap-4 px-3">
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
            <Trans>Tales</Trans>
          </Label>
          <span className="text-sm text-muted-foreground">
            <Trans>Browse and load saved tales</Trans>
          </span>
        </div>
      </div>
      <Separator />
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t`Search tales`}
        className="max-w-md"
      />
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          const logCount = isRemote
            ? item.remoteTale.turnCount
            : item.localTale.logCount;
          const hasConflict =
            item.source === "local" && item.sync?.status === "conflict";
          const syncLabel =
            !isRemote && item.sync && item.sync.status !== "idle"
              ? hasConflict
                ? t`Needs review`
                : item.sync.lastErrorCode || item.sync.status
              : "";
          return (
            <Card
              key={isRemote ? `remote-${id}` : `local-${id}`}
              className="flex flex-col gap-1 pt-0 pb-2 border-accent/50"
            >
              <CardHeader className="p-0 m-0">
                <div className="relative">
                  {thumbnail ? (
                    <img
                      src={bytesToObjectUrl(thumbnail as unknown as Uint8Array)}
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
                          className="h-6 w-6 rounded-full bg-accent/50 pb-1.5"
                          aria-label={t`Tale actions`}
                        >
                          ...
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
                  {isRemote ? (
                    <Badge className="absolute right-9 top-1.5 z-10 bg-accent/70 text-muted-foreground">
                      <Cloud className="size-3" />
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
                        Last played: {formatExactDateTime(updatedAt)}
                      </Trans>
                    </TooltipContent>
                  </Tooltip>
                  <Badge className="absolute left-1 top-8 h-5 bg-accent/50 px-2 text-xs text-muted-foreground">
                    {logCount} {logCount === 1 ? t`turn` : t`turns`}
                  </Badge>
                  {syncLabel ? (
                    <Badge className="absolute left-1 top-14 h-5 bg-accent/50 px-2 text-xs text-muted-foreground">
                      {syncLabel}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex h-36 flex-col gap-2 px-2">
                <span className="line-clamp-2 min-h-9 text-sm font-semibold leading-snug">
                  {name}
                </span>
                <p className="line-clamp-3 min-h-0 flex-1 rounded-xs text-sm text-muted-foreground">
                  {description}
                </p>

                <Button
                  onClick={() => handleLoad(item)}
                  className="mt-auto w-full"
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
    </div>
  );
}
