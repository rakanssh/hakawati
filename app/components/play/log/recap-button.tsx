import { useState, type ReactNode, type SyntheticEvent } from "react";
import { Loader2Icon, ScrollTextIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  parseRecapDraft,
  recapPassages,
  type RecapPassage,
} from "@/lib/recaps";
import { cn } from "@/lib/utils";
import { redoRecaps } from "@/services/story-recaps";
import { useTaleStore } from "@/store/useTaleStore";
import { LogEntry } from "@/types/log.type";

const stop = (event: SyntheticEvent) => event.stopPropagation();

function PassageLabel({ chainIndex }: { chainIndex: number }) {
  return (
    <span className="inline-flex items-center rounded-xs border border-log-thinking/25 bg-log-thinking/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-log-thinking-foreground">
      {chainIndex === 0 ? (
        <Trans>Initial</Trans>
      ) : (
        <Trans>Continuation {chainIndex}</Trans>
      )}
    </span>
  );
}

function RecapBody({
  passages,
  onCommit,
  onDone,
}: {
  passages: RecapPassage[];
  onCommit: (entryId: string, lines: string[]) => void;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const taleId = useTaleStore((state) => state.id);
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
  const [redoing, setRedoing] = useState(false);
  const labelled = passages.length > 1;

  const startEditing = () =>
    setDrafts(
      Object.fromEntries(
        passages.map((passage) => [passage.id, passage.lines.join("\n")]),
      ),
    );

  const save = () => {
    if (!drafts) return;
    for (const passage of passages) {
      const lines = parseRecapDraft(drafts[passage.id] ?? "");
      const changed =
        lines.length !== passage.lines.length ||
        lines.some((line, index) => line !== passage.lines[index]);
      if (changed) onCommit(passage.id, lines);
    }
    setDrafts(null);
    onDone();
  };

  const redo = async () => {
    setRedoing(true);
    try {
      await redoRecaps(
        taleId,
        passages.map((passage) => passage.id),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setRedoing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" onClick={stop} onKeyDown={stop}>
      {passages.map((passage) => (
        <div key={passage.id} className="flex flex-col gap-1.5">
          {labelled && <PassageLabel chainIndex={passage.chainIndex} />}
          {drafts ? (
            <Textarea
              value={drafts[passage.id] ?? ""}
              aria-label={t`Recap`}
              onChange={(event) =>
                setDrafts({ ...drafts, [passage.id]: event.target.value })
              }
            />
          ) : passage.lines.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
              {passage.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Trans>Nothing kept</Trans>
            </p>
          )}
        </div>
      ))}
      <div className="flex flex-wrap justify-end gap-2">
        {drafts ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setDrafts(null)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button size="sm" onClick={save}>
              <Trans>Save</Trans>
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={redoing}
              onClick={() => void redo()}
            >
              {redoing && <Loader2Icon className="size-3.5 animate-spin" />}
              <Trans>Redo</Trans>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={redoing}
              onClick={startEditing}
            >
              <Trans>Edit</Trans>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function RecapButton({
  entries,
  onCommit,
}: {
  entries: LogEntry[];
  onCommit: (entryId: string, lines: string[]) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { isCompactViewport, isMobilePlatform } = useIsMobile();
  const passages = recapPassages(entries);
  if (passages.length === 0) return null;

  const empty = passages.every((passage) => passage.lines.length === 0);
  const body: ReactNode = (
    <RecapBody
      passages={passages}
      onCommit={onCommit}
      onDone={() => setOpen(false)}
    />
  );
  const trigger = (onClick?: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-log-recap=""
      className={cn(
        "order-last ms-auto !h-7 !w-7 shrink-0 text-muted-foreground hover:text-foreground",
        empty && "opacity-50",
      )}
      aria-label={t`Recap`}
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <ScrollTextIcon className="h-3.5 w-3.5" />
    </Button>
  );

  if (isCompactViewport || isMobilePlatform) {
    return (
      <>
        {trigger(() => setOpen(true))}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>
                <Trans>Recap</Trans>
              </DrawerTitle>
            </DrawerHeader>
            <div className="max-h-[60dvh] overflow-y-auto px-4 pb-4">
              {body}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger()}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] max-h-[min(24rem,60dvh)] overflow-y-auto"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
