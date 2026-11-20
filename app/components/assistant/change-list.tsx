import type { ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChartBarIcon,
  FileTextIcon,
  LibraryIcon,
  Loader2Icon,
  PencilLineIcon,
  PlusIcon,
  ScrollTextIcon,
  ShoppingBagIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isPassageShown, revealPassage } from "@/lib/reveal-passage";
import { cn } from "@/lib/utils";
import { undoAssistantReply } from "@/services/assistant/session";
import { useAssistantStore } from "@/store/useAssistantStore";
import {
  useStoryPanelStore,
  type StoryPanelTab,
} from "@/store/useStoryPanelStore";
import { useTaleStore } from "@/store/useTaleStore";
import {
  useSettingsModalStore,
  type SettingsTab,
} from "@/store/useSettingsModalStore";
import { isTaleChange } from "@/lib/assistant-changes";
import { APP_SETTINGS } from "@/services/assistant/app-settings";
import { useAppChangeLabel } from "./app-change-label";
import { GameMode, PromptComponentType } from "@/types";
import type { AssistantChange } from "@/types/assistant.type";

type Icon = ComponentType<{ className?: string }>;

function useChangeLabel() {
  const { t } = useLingui();
  const appLabel = useAppChangeLabel();
  return (change: AssistantChange): { Icon: Icon; label: string } => {
    switch (change.kind) {
      case "setting":
      case "role":
        return appLabel(change);
      case "scenario": {
        const name = change.after.name.trim();
        return {
          Icon: FileTextIcon,
          label: !change.before
            ? t`Created scenario “${name}”`
            : name
              ? t`Changed scenario “${name}”`
              : t`Changed the open scenario`,
        };
      }
      case "field":
        if (change.field === "name")
          return { Icon: PencilLineIcon, label: t`Renamed the tale` };
        if (change.field === "description")
          return { Icon: PencilLineIcon, label: t`Changed the description` };
        return {
          Icon: PencilLineIcon,
          label:
            change.after === GameMode.GM
              ? t`Switched to Game Master`
              : t`Switched to Story Teller`,
        };
      case "component": {
        const cleared = change.after === null;
        const label =
          change.type === PromptComponentType.PLOT
            ? cleared
              ? t`Cleared the plot`
              : t`Changed the plot`
            : change.type === PromptComponentType.AUTHOR_NOTE
              ? cleared
                ? t`Cleared the author's note`
                : t`Changed the author's note`
              : cleared
                ? t`Cleared the AI instructions`
                : t`Changed the AI instructions`;
        return { Icon: ScrollTextIcon, label };
      }
      case "card": {
        const title = (change.after ?? change.before)?.title ?? "";
        return {
          Icon: LibraryIcon,
          label: !change.before
            ? t`Added card “${title}”`
            : !change.after
              ? t`Removed card “${title}”`
              : t`Changed card “${title}”`,
        };
      }
      case "stat": {
        const name = (change.after ?? change.before)?.name ?? "";
        if (!change.before)
          return { Icon: ChartBarIcon, label: t`Added ${name}` };
        if (!change.after)
          return { Icon: ChartBarIcon, label: t`Removed ${name}` };
        const from = change.before.value;
        const to = change.after.value;
        return {
          Icon: ChartBarIcon,
          label:
            from !== to && change.before.name === change.after.name
              ? `${name} ${from} → ${to}`
              : t`Changed ${name}`,
        };
      }
      case "item": {
        const name = (change.after ?? change.before)?.name ?? "";
        return {
          Icon: ShoppingBagIcon,
          label: !change.before
            ? t`Added ${name}`
            : !change.after
              ? t`Removed ${name}`
              : t`Changed ${name}`,
        };
      }
      case "passage":
        return { Icon: PencilLineIcon, label: t`Rewrote a passage` };
      case "insert": {
        const count = change.entries.length;
        return {
          Icon: PlusIcon,
          label: count === 1 ? t`Added a passage` : t`Added ${count} passages`,
        };
      }
      case "delete": {
        const count = change.entries.length;
        return {
          Icon: Trash2Icon,
          label:
            count === 1 ? t`Removed a passage` : t`Removed ${count} passages`,
        };
      }
    }
  };
}

type Target =
  | { passage: string }
  | { tab: StoryPanelTab }
  | { route: string }
  | { settings: SettingsTab };

function targetOf(change: AssistantChange): Target | null {
  if (change.undone) return null;
  switch (change.kind) {
    case "setting":
      return { settings: APP_SETTINGS[change.key]?.tab ?? "appearance" };
    case "role":
      return { settings: "ai-setup" };
    case "scenario":
      return change.target === "library"
        ? { route: `/scenarios/${change.scenarioId}` }
        : null;
    case "passage":
      return { passage: change.id };
    case "insert":
      return change.entries[0] ? { passage: change.entries[0].id } : null;
    case "delete":
      return null;
    case "card":
      return change.after ? { tab: "cards" } : null;
    case "stat":
    case "item":
      return change.after ? { tab: "character" } : null;
    case "field":
    case "component":
      return { tab: "story" };
  }
}

/** The chips for a reply's changes, each opening what it changed. */
export function ChangeChips({ changes }: { changes: AssistantChange[] }) {
  const describe = useChangeLabel();
  const isPlay = useRouterState({
    select: (state) => state.location.pathname.startsWith("/play"),
  });
  const openTaleId = useTaleStore((state) => state.id);
  const { isMobilePlatform } = useIsMobile();
  const navigate = useNavigate();

  const open = (target: Target) => {
    const panel = useStoryPanelStore.getState();
    if ("settings" in target) {
      if (isMobilePlatform) panel.setOpen(false);
      useSettingsModalStore.getState().openSettings(target.settings);
      return;
    }
    if ("route" in target) {
      if (isMobilePlatform) panel.setOpen(false);
      void navigate({ to: target.route });
      return;
    }
    if ("tab" in target) {
      panel.setTab(target.tab);
      return;
    }
    if (!isPassageShown(target.passage)) return;
    if (isMobilePlatform && panel.open) {
      panel.setOpen(false);
      window.setTimeout(() => revealPassage(target.passage), 300);
    } else revealPassage(target.passage);
  };

  return (
    <>
      {changes.map((change, index) => {
        const { Icon, label } = describe(change);
        const target =
          !isTaleChange(change) || (isPlay && change.taleId === openTaleId)
            ? targetOf(change)
            : null;
        const chip = (
          <>
            <Icon className="shrink-0 text-primary" />
            <span dir="auto" className="truncate">
              {label}
            </span>
          </>
        );
        const className = cn(
          "sidebar-chip max-w-full justify-start border-primary/30 bg-primary/8 font-normal text-sidebar-foreground/90",
          change.undone && "line-through opacity-55",
        );
        return target ? (
          <Badge key={index} variant="outline" asChild className={className}>
            <button
              type="button"
              className="cursor-pointer hover:border-primary/55 hover:bg-primary/15"
              onClick={() => open(target)}
            >
              {chip}
            </button>
          </Badge>
        ) : (
          <Badge key={index} variant="outline" className={className}>
            {chip}
          </Badge>
        );
      })}
    </>
  );
}

export function UndoReplyButton({
  changes,
  messageId,
}: {
  changes: AssistantChange[];
  messageId?: string;
}) {
  const { t } = useLingui();
  const running = useAssistantStore((state) => Boolean(state.run));
  const undoingId = useAssistantStore((state) => state.undoingId);
  if (!messageId || !changes.some((change) => !change.undone)) return null;

  const undo = async () => {
    const kept = await undoAssistantReply(messageId);
    if (kept > 0)
      toast.warning(
        kept === 1
          ? t`One change was edited since, so it was kept.`
          : t`${kept} changes were edited since, so they were kept.`,
      );
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
      disabled={running || Boolean(undoingId)}
      onClick={() => void undo()}
    >
      {undoingId === messageId ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <Undo2Icon className="size-3.5" />
      )}
      <Trans>Undo</Trans>
    </Button>
  );
}
