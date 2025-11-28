import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2Icon } from "lucide-react";
import { LogEntryBubble, LogBlockBubble } from "@/components/play/log";
import { InlineEditableContent } from "@/components/sidebar";
import { LogEntry, LogEntryRole } from "@/types/log.type";
import { LogBlock } from "@/lib/play-utils";
import { useSettingsStore } from "@/store";

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
      className="min-h-0 w-full px-2 py-0"
      viewportRef={viewportRef}
      onViewportScroll={onViewportScroll}
      viewportClassName="!flex !flex-col"
      style={
        { "--game-log-font-size": `${fontSize}rem` } as React.CSSProperties
      }
    >
      {loadingOlder && (
        <div className="flex items-center justify-center py-2 text-muted-foreground">
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm">Loading older entries...</span>
        </div>
      )}
      {blocks.length > 0 ? (
        blocks.map((block, blockIndex) => {
          const isLastBlock = blockIndex === blocks.length - 1;
          const isStreamingBlock =
            isStreaming && isLastBlock && block.role === LogEntryRole.GM;

          return (
            <div key={block.entries[0].id} className="mt-2">
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
                        className="bg-amber-300/10 py-0.5 border-b-1 border-b-amber-700/25"
                        style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer"
                        onClick={onClick}
                        style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
                      >
                        {entry.text}
                      </span>
                    )
                  }
                />
              ) : (
                block.entries.map((entry) =>
                  currentlyEditingLogId === entry.id ? (
                    <div key={entry.id} className="bg-accent/50 rounded-md p-0">
                      <InlineEditableContent
                        initialValue={entry.text}
                        onCommit={(next) => {
                          updateLogEntry(entry.id, { text: next });
                          setCurrentlyEditingLogId(null);
                        }}
                        onCancel={() => setCurrentlyEditingLogId(null)}
                        style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
                      />
                    </div>
                  ) : (
                    <div
                      key={entry.id}
                      className={`whitespace-pre-wrap hover:bg-accent/50 rounded-md cursor-pointer ${
                        currentlyEditingLogId === entry.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setCurrentlyEditingLogId(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setCurrentlyEditingLogId(entry.id);
                        }
                      }}
                    >
                      <LogEntryBubble entry={entry} />
                    </div>
                  ),
                )
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
    </ScrollArea>
  );
}
