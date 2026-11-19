import type { ComponentProps } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FezIcon } from "@/components/ui/fez-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { useStoryPanelStore } from "@/store/useStoryPanelStore";

/** Opens the panel on Hakawati, or closes it when Hakawati is already showing. */
export function HakawatiButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { t } = useLingui();
  const isPlay = useRouterState({
    select: (state) => Boolean(state.location.pathname?.startsWith("/play")),
  });
  const open = useStoryPanelStore((state) => state.open);
  const tab = useStoryPanelStore((state) => state.tab);
  const showing = open && (!isPlay || tab === "hakawati");

  const toggle = () => {
    const panel = useStoryPanelStore.getState();
    if (showing) {
      panel.setOpen(false);
      return;
    }
    if (isPlay) panel.setTab("hakawati");
    panel.setOpen(true);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={t`Hakawati`}
          aria-pressed={showing}
          className={cn(
            showing && "bg-accent text-accent-foreground",
            className,
          )}
          {...props}
        >
          <FezIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <Trans>Hakawati</Trans>
      </TooltipContent>
    </Tooltip>
  );
}

/** The Hakawati button for page headers on phones, which have no title bar. */
export function PhoneHakawatiButton({ className }: { className?: string }) {
  const { isMobilePlatform } = useIsMobile();
  if (!isMobilePlatform) return null;
  return (
    <HakawatiButton variant="outline" className={cn("shrink-0", className)} />
  );
}
