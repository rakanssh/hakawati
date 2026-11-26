import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";

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
import { Textarea } from "@/components/ui/textarea";

// The app's own dialogs: Apple's web view shows no window.prompt or confirm.
export function ReportScenarioDialog({
  open,
  onOpenChange,
  onReport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReport: (reason: string) => void;
}) {
  const { t } = useLingui();
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Report this scenario?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Tell the moderators what is wrong with it.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t`Report reason`}
          aria-label={t`Report reason`}
          rows={3}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onReport(reason.trim())}
            disabled={!reason.trim()}
          >
            <Trans>Report</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BlockPublisherDialog({
  publisherName,
  onOpenChange,
  onBlock,
}: {
  publisherName: string | null;
  onOpenChange: (open: boolean) => void;
  onBlock: () => void;
}) {
  const { t } = useLingui();
  return (
    <AlertDialog open={publisherName !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Block publisher</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t`Block ${publisherName ?? ""}? You will no longer see their scenarios.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onBlock}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Trans>Block publisher</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
