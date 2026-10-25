import { Trans } from "@lingui/react/macro";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReleaseNotes } from "./release-notes";

interface WhatsNewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  notes: string;
}

export function WhatsNewModal({
  open,
  onOpenChange,
  version,
  notes,
}: WhatsNewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-xl"
      >
        <DialogTitle className="flex flex-col gap-1.5 border-b px-6 pt-5 pb-4 pe-12">
          <span
            data-sidebar-heading=""
            className="text-xs font-semibold text-muted-foreground"
          >
            <Trans>What’s New</Trans>
          </span>
          <span className="text-xl leading-tight">
            <Trans>Hakawati {version}</Trans>
          </span>
        </DialogTitle>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
          <ReleaseNotes notes={notes} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button onClick={() => onOpenChange(false)}>
            <Trans>Got it</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
