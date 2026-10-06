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
  const { t } = useLingui();
  const fontSize = useSettingsStore((state) => state.fontSize);
  const highlightLatestSection = useSettingsStore(
    (state) => state.highlightLatestSection,
  );
  const latestGmEntryId = getLatestGmEntryId(blocks);
  const { isMobilePlatform } = useIsMobile();
  const editingSelectionClass = "rounded-[0.2rem] bg-primary/20 py-0.5";
  const renderEditor = (entry: LogEntry) => (
    <InlineEditableContent
      key={entry.id}
      initialValue={entry.text}
      onCommit={(next) => {
        updateLogEntry(entry.id, { text: next });
        setCurrentlyEditingLogId(null);
      }}
      onCancel={() => setCurrentlyEditingLogId(null)}
      variant="inline"
      className={editingSelectionClass}
      style={{ fontSize: "var(--game-log-font-size, 1rem)" }}
    />
  );

  return (
    <div className="relative min-h-0">
      {/* A reading surface behind the column, styled by the theme; it stays put while the story scrolls. */}
      <div
        data-play-backdrop=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mx-auto w-full max-w-(--play-column-max)"
      />
      <ScrollArea
        className="h-full min-h-0 w-full"
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
          className="mx-auto flex min-h-full w-full max-w-(--play-column-max) flex-col px-3 pt-8 sm:px-5 sm:pt-10 lg:px-7"
          style={
            isMobilePlatform
              ? { paddingTop: "calc(3.5rem + env(safe-area-inset-top))" }
              : undefined
          }
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
                      onNarrate: () => narration.onNarrate(blockNarrationItem),
                    }
                  : undefined;

              return (
                <div key={block.entries[0].id} className="py-1.5">
                  {block.role === LogEntryRole.GM ? (
                    <LogBlockBubble
                      block={block}
                      isStreaming={isStreamingBlock}
                      onEditStart={(entryId) =>
                        setCurrentlyEditingLogId(entryId)
                      }
                      editDisabled={isStreaming}
                      highlightedEntryId={
                        highlightLatestSection
                          ? (latestGmEntryId ?? undefined)
                          : undefined
                      }
                      narration={blockNarration}
                      renderEntry={
                        block.entries.some(
                          (entry) => entry.id === currentlyEditingLogId,
                        )
                          ? (entry) =>
                              entry.id === currentlyEditingLogId ? (
                                renderEditor(entry)
                              ) : (
                                <span
                                  className="cursor-pointer"
                                  role="button"
                                  tabIndex={0}
                                  aria-label={t`Edit entry`}
                                  onClick={() =>
                                    setCurrentlyEditingLogId(entry.id)
                                  }
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      setCurrentlyEditingLogId(entry.id);
                                    }
                                  }}
                                >
                                  {entry.text}
                                </span>
                              )
                          : undefined
                      }
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
                          tabIndex={!isEditing && !isStreaming ? 0 : undefined}
                          aria-label={
                            !isEditing && !isStreaming
                              ? t`Edit entry`
                              : undefined
                          }
                          onClick={
                            !isEditing && !isStreaming
                              ? () => setCurrentlyEditingLogId(entry.id)
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
                              isEditing ? renderEditor(entry) : undefined
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
          <div ref={bottomRef} className="mt-2 h-px" />
        </div>
      </ScrollArea>
    </div>
  );
}
