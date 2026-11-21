import { useEffect, useState, type ComponentProps } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FezIcon } from "@/components/ui/fez-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HAKAWATI_SHORTCUT } from "@/hooks/useHakawatiShortcut";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { useStoryPanelStore } from "@/store/useStoryPanelStore";

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
        <span className="ms-2 opacity-70">{HAKAWATI_SHORTCUT}</span>
      </TooltipContent>
    </Tooltip>
  );
}

const TEXT_FIELD =
  "textarea, select, [contenteditable=''], [contenteditable='true'], input:not([type=button],[type=checkbox],[type=file],[type=radio],[type=range],[type=submit])";

const isTextField = (target: EventTarget | null) =>
  target instanceof Element && target.matches(TEXT_FIELD);

function useEditingText() {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const focusIn = (event: FocusEvent) =>
      setEditing(isTextField(event.target));
    const focusOut = (event: FocusEvent) =>
      setEditing(isTextField(event.relatedTarget));
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => {
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
    };
  }, []);
  return editing;
}

export function HakawatiFab() {
  const { t } = useLingui();
  const { isMobilePlatform } = useIsMobile();
  const isPlay = useRouterState({
    select: (state) => Boolean(state.location.pathname?.startsWith("/play")),
  });
  const open = useStoryPanelStore((state) => state.open);
  const editing = useEditingText();

  // Play keeps Hakawati in its story panel, so its composer has the bottom to itself.
  if (!isMobilePlatform || isPlay || open || editing) return null;

  return (
    <Button
      size="icon"
      data-hakawati-fab=""
      onClick={() => useStoryPanelStore.getState().setOpen(true)}
      aria-label={t`Hakawati`}
      className="fixed z-40 size-14 shadow-lg animate-in fade-in zoom-in-90 duration-150"
      style={{
        bottom: "calc(1rem + env(safe-area-inset-bottom))",
        insetInlineEnd:
          "calc(1rem + max(env(safe-area-inset-left), env(safe-area-inset-right)))",
      }}
    >
      <FezIcon className="size-6" />
    </Button>
  );
}
