import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaleConflictChoice } from "@/hooks/useTaleLibrary";
import type { LibraryTaleItem } from "@/lib/tale-library";
import { Cloud, FilePlus2Icon, PencilIcon } from "lucide-react";
import { Trans } from "@lingui/react/macro";

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
  const name = item?.source === "local" ? item.localTale.name : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Resolve sync conflict</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              {name} changed here and in cloud sync. Choose which version to
              open.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>
            <Trans>
              Use Cloud replaces this device&apos;s unsynced changes.
            </Trans>
          </p>
          <p>
            <Trans>Keep This Device replaces the cloud version.</Trans>
          </p>
          <p>
            <Trans>Keep Both saves this device&apos;s version as a copy.</Trans>
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={resolving}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant="outline"
            onClick={() => onResolve("keep-remote")}
            disabled={resolving}
          >
            <Cloud className="size-4" />
            <Trans>Use Cloud</Trans>
          </Button>
          <Button
            variant="outline"
            onClick={() => onResolve("keep-local")}
            disabled={resolving}
          >
            <PencilIcon className="size-4" />
            <Trans>Keep This Device</Trans>
          </Button>
          <Button onClick={() => onResolve("keep-both")} disabled={resolving}>
            <FilePlus2Icon className="size-4" />
            <Trans>Keep Both</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
