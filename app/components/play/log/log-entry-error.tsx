import { CircleAlertIcon } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { getLogErrorReason } from "@/lib/play-utils";

interface LogEntryErrorProps {
  error: unknown;
}

// Not a tooltip: touch screens have no hover.
export function LogEntryError({ error }: LogEntryErrorProps) {
  const { t } = useLingui();

  return (
    <p
      data-log-error=""
      className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive"
    >
      <CircleAlertIcon
        aria-hidden="true"
        className="mt-[0.2em] size-[1em] shrink-0"
      />
      <span className="min-w-0 whitespace-pre-wrap break-words">
        {getLogErrorReason(error) ?? t`Request failed`}
      </span>
    </p>
  );
}
