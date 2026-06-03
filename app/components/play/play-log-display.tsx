import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2Icon } from "lucide-react";
import { LogEntryBubble, LogBlockBubble } from "@/components/play/log";
import { InlineEditableContent } from "@/components/sidebar";
import { LogEntry, LogEntryRole } from "@/types/log.type";
import { LogBlock } from "@/lib/play-utils";
import { useSettingsStore } from "@/store";
import { Trans } from "@lingui/react/macro";

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
}: PlayLogDisplayProps) {
  const fontSize = useSettingsStore((state) => state.fontSize);

  return (
    <ScrollArea
      className="min-h-0 w-full"
      viewportRef={viewportRef}
      onViewportScroll={onViewportScroll}
      viewportClassName="!flex !flex-col"
      style={
        { "--game-log-font-size": `${fontSize}rem` } as React.CSSProperties
      }
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 py-5 sm:px-8 lg:px-10">
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

            return (
              <div key={block.entries[0].id} className="py-2">
                {block.role === LogEntryRole.GM ? (
                  <LogBlockBubble
                    block={block}
                    isStreaming={isStreamingBlock}
                    onEditStart={(entryId) => setCurrentlyEditingLogId(entryId)}
                    renderEntry={(entry, onClick) =>
                      currentlyEditingLogId === entry.id ? (
                        <InlineEditableContent
                          initialValue={entry.text}
                          onCommit={(next) => {
                            updateLogEntry(entry.id, { text: next });
                            setCurrentlyEditingLogId(null);
                          }}
                          onCancel={() => setCurrentlyEditingLogId(null)}
                          variant="inline"
                          className="border-b-1 border-b-log-thinking/25 bg-log-thinking/10 py-0.5"
                          style={{
                            fontSize: "var(--game-log-font-size, 1rem)",
                          }}
                        />
                      ) : (
                        <span
                          className="cursor-pointer"
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
                      )
                    }
                  />
                ) : (
                  block.entries.map((entry) => {
                    const isEditing = currentlyEditingLogId === entry.id;

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
