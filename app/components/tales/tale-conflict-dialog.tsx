import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaleConflictChoice } from "@/hooks/useTaleLibrary";
import type { LibraryTaleItem } from "@/lib/tale-library";
import { formatExactDateTime, formatRelativeTime } from "@/lib/utils";
import { Cloud, FilePlus2Icon, HardDrive } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";

type TaleConflictDialogProps = {
  item: LibraryTaleItem | null;
  open: boolean;
  resolving: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (choice: TaleConflictChoice) => void;
};

export function TaleConflictDialog({
  item,
  open,
  resolving,
  onOpenChange,
  onResolve,
}: TaleConflictDialogProps) {
  const { t } = useLingui();
  const localEntryCount =
    item?.source === "local" ? item.localTale.logCount : 0;
  const localUpdatedAt =
    item?.source === "local" ? item.localTale.updatedAt : 0;
  const remoteTale = item?.source === "local" ? item.sync?.remoteTale : null;
  const remoteEntryCount =
    remoteTale?.entryCount ?? remoteTale?.turnCount ?? null;
  const remoteUpdatedAt = remoteTale
    ? Date.parse(remoteTale.updatedAt) || 0
    : 0;

  const versionLabel = (updatedAt: number) =>
    updatedAt
      ? `${formatRelativeTime(updatedAt)} · ${formatExactDateTime(updatedAt)}`
      : t`Unknown time`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Resolve sync conflict</Trans>
          </DialogTitle>
          <DialogDescription className="pe-8">
            <Trans>
              The tale changed here and in the cloud, pick one to keep or save
              both.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto min-w-0 justify-start p-4 text-start"
            onClick={() => onResolve("keep-remote")}
            disabled={resolving}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Cloud className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">
                  <Trans>Keep Cloud</Trans>
                </div>
                <div className="mt-1 text-sm font-normal text-muted-foreground">
                  {remoteEntryCount === null ? (
                    <Trans>Unknown entries</Trans>
                  ) : (
                    <Trans>
                      {remoteEntryCount}{" "}
                      {remoteEntryCount === 1 ? t`entry` : t`entries`}
                    </Trans>
                  )}
                </div>
                <div className="mt-1 whitespace-normal text-xs font-normal text-muted-foreground">
                  {versionLabel(remoteUpdatedAt)}
                </div>
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto min-w-0 justify-start p-4 text-start"
            onClick={() => onResolve("keep-local")}
            disabled={resolving}
          >
            <div className="flex min-w-0 items-start gap-3">
              <HardDrive className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">
                  <Trans>Keep This Device</Trans>
                </div>
                <div className="mt-1 text-sm font-normal text-muted-foreground">
                  <Trans>
                    {localEntryCount}{" "}
                    {localEntryCount === 1 ? t`entry` : t`entries`}
                  </Trans>
                </div>
                <div className="mt-1 whitespace-normal text-xs font-normal text-muted-foreground">
                  {versionLabel(localUpdatedAt)}
                </div>
              </div>
            </div>
          </Button>
        </div>
        <div className="grid gap-2">
          <Button
            variant="secondary"
            className="h-11 w-full"
            onClick={() => onResolve("keep-both")}
            disabled={resolving}
          >
            <FilePlus2Icon className="size-4" />
            <Trans>Keep both (make a copy)</Trans>
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={resolving}
          >
            <Trans>Cancel</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
