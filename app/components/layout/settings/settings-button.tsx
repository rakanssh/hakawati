import { Button } from "../../ui/button";
import { SettingsIcon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { SettingsModal, SettingsTabId } from "@/components/layout/settings";
import { useUpdateStore } from "@/store/useUpdateStore";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { Trans } from "@lingui/react/macro";

export function SettingsButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const hasUpdateNotification = useUpdateStore(
    (state) => state.hasNotification,
  );

  const visibleTabs: readonly SettingsTabId[] = [
    "game",
    "api",
    "model",
    "updates",
    "about",
    "advanced",
  ];

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
      setIsOpen(true);
    },
    [isOpen],
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
            onClick={() => setIsOpen(true)}
            className={cn("relative", className)}
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

      <SettingsModal
        open={isOpen}
        onOpenChange={setIsOpen}
        visibleTabs={visibleTabs}
      />
    </>
  );
}
