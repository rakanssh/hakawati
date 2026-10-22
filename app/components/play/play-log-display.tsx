import { useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2Icon } from "lucide-react";
import { LogEntryBubble, LogBlockBubble } from "@/components/play/log";
import { StoryText } from "@/components/play/log/story-text";
import { LogEntry, LogEntryRole } from "@/types/log.type";
import {
  getLatestGmEntryId,
  getLogBlockNarrationItem,
  getStoryEntryNarrationItem,
  LogBlock,
  NarrationItem,
} from "@/lib/play-utils";
import { useSettingsStore } from "@/store";
import { Trans, useLingui } from "@lingui/react/macro";
import { useIsMobile } from "@/hooks/useIsMobile";

interface PlayLogDisplayProps {
  blocks: LogBlock[];
  loadingOlder: boolean;
  isStreaming: boolean;
  currentlyEditingLogId: string | null;
  setCurrentlyEditingLogId: (id: string | null) => void;
  updateLogEntry: (id: string, updates: Partial<LogEntry>) => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
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
  onViewportScroll,
  narration,
}: PlayLogDisplayProps) {
  const { t } = useLingui();
  const fontSize = useSettingsStore((state) => state.fontSize);
  const highlightLatestSection = useSettingsStore(
    (state) => state.highlightLatestSection,
  );
  const latestGmEntryId = getLatestGmEntryId(blocks);
  const { isMobilePlatform } = useIsMobile();
  // Remember where the reader pressed, so an edit can put the caret right there.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [editPoint, setEditPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const startEditing = (entryId: string) => {
    setEditPoint(pointerRef.current);
    setCurrentlyEditingLogId(entryId);
  };
  const commitEdit = (entryId: string, text: string) => {
    updateLogEntry(entryId, { text });
    setCurrentlyEditingLogId(null);
  };
  const cancelEdit = () => setCurrentlyEditingLogId(null);

  return (
    <div
      className="relative min-h-0"
      onPointerDownCapture={(event) => {
        pointerRef.current = { x: event.clientX, y: event.clientY };
      }}
      onKeyDownCapture={() => {
        pointerRef.current = null;
      }}
    >
      {/* The reading surface, styled by the theme. The story scrolls inside it, so text and the scrollbar stay within its frame. */}
      <div
        data-play-backdrop=""
        className="absolute inset-x-0 mx-auto flex w-full max-w-(--play-column-max) flex-col overflow-hidden"
      >
        <ScrollArea
          className="min-h-0 w-full flex-1"
          viewportRef={viewportRef}
          onViewportScroll={onViewportScroll}
          viewportClassName="!flex !flex-col"
          style={
            {
              "--game-log-font-size": `calc(${fontSize}rem * var(--story-scale, 1))`,
            } as React.CSSProperties
          }
        >
          <div
            data-play-column=""
            className="mx-auto flex min-h-full w-full max-w-(--play-column-max) flex-col px-3 pt-8 pb-2.5 sm:px-5 sm:pt-7 lg:px-7"
            // Room for the phone's top bar.
            style={isMobilePlatform ? { paddingTop: "3rem" } : undefined}
          >
            {loadingOlder && (
              <div className="flex items-center justify-center py-2 text-muted-foreground">
                <Loader2Icon className="me-2 h-4 w-4 animate-spin" />
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
                        isActive:
                          narration.activeItemId === blockNarrationItem.id,
                        onNarrate: () =>
                          narration.onNarrate(blockNarrationItem),
                      }
                    : undefined;

                return (
                  <div key={block.entries[0].id} className="py-1.5">
                    {block.role === LogEntryRole.GM ? (
                      <LogBlockBubble
                        block={block}
                        isStreaming={isStreamingBlock}
                        onEditStart={startEditing}
                        editingEntryId={currentlyEditingLogId}
                        editPoint={editPoint}
                        onEditCommit={commitEdit}
                        onEditCancel={cancelEdit}
                        editDisabled={isStreaming}
                        highlightedEntryId={
                          highlightLatestSection
                            ? (latestGmEntryId ?? undefined)
                            : undefined
                        }
                        narration={blockNarration}
                      />
                    ) : (
                      block.entries.map((entry) => {
                        const isEditing = currentlyEditingLogId === entry.id;
                        const entryNarrationItem =
                          getStoryEntryNarrationItem(entry);

                        return (
                          <div
                            key={entry.id}
                            className={`rounded-xs ${!isEditing && !isStreaming ? "cursor-pointer hover:bg-accent/20" : ""}`}
                            role={
                              !isEditing && !isStreaming ? "button" : undefined
                            }
                            tabIndex={
                              !isEditing && !isStreaming ? 0 : undefined
                            }
                            aria-label={
                              !isEditing && !isStreaming
                                ? t`Edit entry`
                                : undefined
                            }
                            onClick={
                              !isEditing && !isStreaming
                                ? () => startEditing(entry.id)
                                : undefined
                            }
                            onKeyDown={(event) => {
                              if (
                                isEditing ||
                                isStreaming ||
                                event.target !== event.currentTarget
                              )
                                return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                startEditing(entry.id);
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
                                  <StoryText
                                    segments={[
                                      { id: entry.id, text: entry.text },
                                    ]}
                                    editingSegmentId={entry.id}
                                    editPoint={editPoint}
                                    onCommitEdit={commitEdit}
                                    onCancelEdit={cancelEdit}
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
                  <Trans>
                    Take an action or send a director&apos;s note to start the
                    adventure.
                  </Trans>
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
