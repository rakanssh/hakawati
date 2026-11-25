import { Trans } from "@lingui/react/macro";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ChangelogRelease } from "@/lib/changelog";
import { ReleaseNotes } from "./release-notes";

interface WhatsNewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  releases: ChangelogRelease[];
}

export function WhatsNewModal({
  open,
  onOpenChange,
  version,
  releases,
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
        <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
          {releases.map((release) => (
            <section key={release.version} className="flex flex-col gap-3">
              {releases.length > 1 && (
                <h2 className="border-b pb-2 text-sm font-semibold text-muted-foreground">
                  {release.version}
                </h2>
              )}
              <ReleaseNotes notes={release.notes} />
            </section>
          ))}
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
