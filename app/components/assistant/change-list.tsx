import type { ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChartBarIcon,
  LibraryIcon,
  Loader2Icon,
  PencilLineIcon,
  PlusIcon,
  ScrollTextIcon,
  ShoppingBagIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { undoAssistantReply } from "@/services/assistant/session";
import { useAssistantStore } from "@/store/useAssistantStore";
import { GameMode, PromptComponentType } from "@/types";
import type { AssistantChange } from "@/types/assistant.type";

type Icon = ComponentType<{ className?: string }>;

function useChangeLabel() {
  const { t } = useLingui();
  return (change: AssistantChange): { Icon: Icon; label: string } => {
    switch (change.kind) {
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

export function ChangeList({
  changes,
  messageId,
}: {
  changes: AssistantChange[];
  messageId?: string;
}) {
  const { t } = useLingui();
  const describe = useChangeLabel();
  const running = useAssistantStore((state) => Boolean(state.run));
  const undoingId = useAssistantStore((state) => state.undoingId);
  const undoing = Boolean(messageId) && undoingId === messageId;
  const canUndo = Boolean(messageId) && changes.some((c) => !c.undone);

  const undo = async () => {
    if (!messageId) return;
    const kept = await undoAssistantReply(messageId);
    if (kept > 0)
      toast.warning(
        kept === 1
          ? t`One change was edited since, so it was kept.`
          : t`${kept} changes were edited since, so they were kept.`,
      );
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-1">
      {changes.map((change, index) => {
        const { Icon, label } = describe(change);
        return (
          <Badge
            key={index}
            variant="outline"
            className={cn(
              "sidebar-chip max-w-full justify-start border-primary/30 bg-primary/8 font-normal text-sidebar-foreground/90",
              change.undone && "line-through opacity-55",
            )}
          >
            <Icon className="shrink-0 text-primary" />
            <span dir="auto" className="truncate">
              {label}
            </span>
          </Badge>
        );
      })}
      {canUndo ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          disabled={running || Boolean(undoingId)}
          onClick={() => void undo()}
        >
          {undoing ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <Undo2Icon className="size-3.5" />
          )}
          <Trans>Undo</Trans>
        </Button>
      ) : null}
    </div>
  );
}
