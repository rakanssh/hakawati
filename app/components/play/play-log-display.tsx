import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2Icon } from "lucide-react";
import { LogEntryBubble, LogBlockBubble } from "@/components/play/log";
import { InlineEditableContent } from "@/components/sidebar";
import { LogEntry, LogEntryRole } from "@/types/log.type";
import {
  getLatestGmEntryId,
  getLogBlockNarrationItem,
  getStoryEntryNarrationItem,
  LogBlock,
  NarrationItem,
} from "@/lib/play-utils";
import { useSettingsStore } from "@/store";
import { Trans } from "@lingui/react/macro";
import { cn } from "@/lib/utils";

interface PlayLogDisplayProps {
  blocks: LogBlock[];
  loadingOlder: boolean;
  isStreaming: boolean;
  currentlyEditingLogId: string | null;
  setCurrentlyEditingLogId: (id: string | null) => void;
  updateLogEntry: (id: string, updates: Partial<LogEntry>) => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onViewportScroll: () => void;
  narration?: {
    activeItemId: string | null;
    loadingItemId: string | null;
    onNarrate: (item: NarrationItem) => void;
  };
}

export function PlayLogDisplay({
  blocks,
  loadingOlder,
  isStreaming,
  currentlyEditingLogId,
  setCurrentlyEditingLogId,
  updateLogEntry,
  viewportRef,
  bottomRef,
  onViewportScroll,
  narration,
}: PlayLogDisplayProps) {
  const fontSize = useSettingsStore((state) => state.fontSize);
  const latestGmEntryId = getLatestGmEntryId(blocks);

  return (
    <ScrollArea
      className="play-log-texture min-h-0 w-full"
      viewportRef={viewportRef}
      onViewportScroll={onViewportScroll}
      viewportClassName="!flex !flex-col"
      style={
        { "--game-log-font-size": `${fontSize}rem` } as React.CSSProperties
      }
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-3 pb-3 pt-8 sm:px-5 sm:pb-4 sm:pt-10 lg:px-7">
        {loadingOlder && (
          <div className="flex items-center justify-center py-2 text-muted-foreground">
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            <span className="text-sm">
              <Trans>Loading older entries...</Trans>
            </span>
          </div>
        )}
        {blocks.length > 0 ? (
          blocks.map((block, blockIndex) => {
            const isLastBlock = blockIndex === blocks.length - 1;
            const isStreamingBlock =
              isStreaming && isLastBlock && block.role === LogEntryRole.GM;
            const blockNarrationItem = getLogBlockNarrationItem(block);
            const blockNarration =
              narration && blockNarrationItem
                ? {
                    isLoading:
                      narration.loadingItemId === blockNarrationItem.id,
                    isActive: narration.activeItemId === blockNarrationItem.id,
                    onNarrate: () => narration.onNarrate(blockNarrationItem),
                  }
                : undefined;

            return (
              <div key={block.entries[0].id} className="py-1.5">
                {block.role === LogEntryRole.GM ? (
                  <LogBlockBubble
                    block={block}
                    isStreaming={isStreamingBlock}
                    onEditStart={(entryId) => setCurrentlyEditingLogId(entryId)}
                    narration={blockNarration}
                    renderEntry={(entry, onClick) => {
                      const isEditing = currentlyEditingLogId === entry.id;
                      const isLatestGmEntry = latestGmEntryId === entry.id;
                      const underlineClass =
                        "underline decoration-muted-foreground/35 underline-offset-4";

                      return isEditing ? (
                        <InlineEditableContent
                          initialValue={entry.text}
                          onCommit={(next) => {
                            updateLogEntry(entry.id, { text: next });
                            setCurrentlyEditingLogId(null);
                          }}
                          onCancel={() => setCurrentlyEditingLogId(null)}
                          variant="inline"
                          className={cn(
                            "bg-log-thinking/10 py-0.5",
                            underlineClass,
                          )}
                          style={{
                            fontSize: "var(--game-log-font-size, 1rem)",
                          }}
                        />
                      ) : (
                        <span
                          className={cn(
                            "cursor-pointer",
                            isLatestGmEntry && underlineClass,
                          )}
                          onClick={onClick}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onClick();
                            }
                          }}
                          aria-label="Edit entry"
                          style={{
                            fontSize: "var(--game-log-font-size, 1rem)",
                          }}
                        >
                          {entry.text}
                        </span>
                      );
                    }}
                  />
                ) : (
                  block.entries.map((entry) => {
                    const isEditing = currentlyEditingLogId === entry.id;
                    const entryNarrationItem =
                      getStoryEntryNarrationItem(entry);

                    return (
                      <div
                        key={entry.id}
                        className={`rounded-xs whitespace-pre-wrap transition-colors ${
                          isEditing
                            ? "bg-accent/20"
                            : "cursor-pointer hover:bg-accent/20"
                        }`}
                        onClick={
                          isEditing
                            ? undefined
                            : () => setCurrentlyEditingLogId(entry.id)
                        }
                        role="button"
                        tabIndex={0}
                        aria-label="Edit entry"
                        onKeyDown={(e) => {
                          if (isEditing) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setCurrentlyEditingLogId(entry.id);
                          }
                        }}
                      >
                        <LogEntryBubble
                          entry={entry}
                          narration={
                            narration && entryNarrationItem
                              ? {
                                  isLoading:
                                    narration.loadingItemId ===
                                    entryNarrationItem.id,
                                  isActive:
                                    narration.activeItemId ===
                                    entryNarrationItem.id,
                                  onNarrate: () =>
                                    narration.onNarrate(entryNarrationItem),
                                }
                              : undefined
                          }
                          content={
                            isEditing ? (
                              <InlineEditableContent
                                initialValue={entry.text}
                                onCommit={(next) => {
                                  updateLogEntry(entry.id, { text: next });
                                  setCurrentlyEditingLogId(null);
                                }}
                                onCancel={() => setCurrentlyEditingLogId(null)}
                                variant="inline"
                                className="m-0 inline p-0 align-baseline text-inherit [line-height:inherit]"
                                style={{
                                  fontSize: "var(--game-log-font-size, 1rem)",
                                }}
                              />
                            ) : undefined
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p
              className="text-muted-foreground"
              style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
            >
              Take an action or send a director&apos;s note to start the
              adventure.
            </p>
          </div>
        )}
        <div ref={bottomRef} className="mt-2 h-px" />
      </div>
    </ScrollArea>
  );
}
