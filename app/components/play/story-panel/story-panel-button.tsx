import type { ComponentProps } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { PanelRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStoryPanelStore } from "@/store/useStoryPanelStore";
import { STORY_PANEL_ID } from "./story-panel";

/** Opens and closes the story panel on the right of the play screen. */
export function StoryPanelButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { t } = useLingui();
  const open = useStoryPanelStore((state) => state.open);
  const toggle = useStoryPanelStore((state) => state.toggle);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={open ? t`Close story panel` : t`Open story panel`}
          aria-expanded={open}
          aria-controls={STORY_PANEL_ID}
          className={cn(open && "bg-accent text-accent-foreground", className)}
          {...props}
        >
          <PanelRightIcon className="size-4 rtl:-scale-x-100" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {open ? (
          <Trans>Close story panel</Trans>
        ) : (
          <Trans>Story, cards and display</Trans>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
