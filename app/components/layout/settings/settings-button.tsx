import { Button } from "../../ui/button";
import { SettingsIcon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useSettingsModalStore } from "@/store/useSettingsModalStore";
import { useUpdateStore } from "@/store/useUpdateStore";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { Trans, useLingui } from "@lingui/react/macro";

export function SettingsButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { t } = useLingui();
  const isOpen = useSettingsModalStore((state) => state.open);
  const openSettings = useSettingsModalStore((state) => state.openSettings);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const hasUpdateNotification = useUpdateStore(
    (state) => state.hasNotification,
  );

  // Close tooltip when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTooltipOpen(false);
    }
  }, [isOpen]);

  const handleEscapeKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isOpen) return;
      if (event.defaultPrevented) return;

      const target = event.target as HTMLElement;
      const isEditableElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      const hasOpenDialog = document.querySelector('[role="dialog"]');

      if (isEditableElement || hasOpenDialog) return;

      event.preventDefault();
      openSettings();
    },
    [isOpen, openSettings],
  );

  useEffect(() => {
    globalThis.addEventListener("keydown", handleEscapeKey);
    return () => globalThis.removeEventListener("keydown", handleEscapeKey);
  }, [handleEscapeKey]);

  return (
    <>
      <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openSettings()}
            className={cn("relative", className)}
            aria-label={t`Settings`}
            {...props}
          >
            <SettingsIcon className="w-4 h-4" />
            {hasUpdateNotification ? (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-destructive"
              />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <Trans>Settings</Trans>
        </TooltipContent>
      </Tooltip>
    </>
  );
}
