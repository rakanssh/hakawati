import { useTaleStore } from "@/store/useTaleStore";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout";
import { MobilePlayHeader } from "@/components/layout/mobile-play-header";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/useSettingsStore";
import { GameMode, LogEntryMode, LogEntryRole } from "@/types";
import { usePersistTale, useLoadTale } from "@/hooks/useGameSaves";
import { toast } from "sonner";
import { PlayInputControls, PlayLogDisplay } from "@/components/play";
import { groupLogEntriesIntoBlocks } from "@/lib/play-utils";
import { Outlet } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useZoom } from "@/hooks/useZoom";
import { useAutoSave } from "@/hooks/useAutoSave";
import { usePlaySession } from "@/hooks/usePlaySession";
import { Trans, useLingui } from "@lingui/react/macro";

export default function Play() {
  const { t } = useLingui();
  const {
    log,
    updateLogEntry,
    oldestLoadedIndex,
    isLoadingOlderEntries,
    loadOlderLogEntries,
    stats,
    inventory,
    storyCards,
    gameMode,
    id: taleId,
  } = useTaleStore();

  const { fontSize, setFontSize, model } = useSettingsStore();
  const { isMobilePlatform } = useIsMobile();
  const { lastPlayedTaleId } = useLastPlayedStore();
  const { load, loading: isLoadingTale } = useLoadTale();
  const { save } = usePersistTale();

  const [currentlyEditingLogId, setCurrentlyEditingLogId] = useState<
    string | null
  >(null);

  const lastTaleIdRef = useRef(taleId);
  const hasAutoSentRef = useRef(false);

  const {
    input,
    setInput,
    action,
    setAction,
    loading,
    saving,
    handleSubmit,
    handleContinue,
    handleRetry,
    handleStop,
    executeLlmSend,
  } = usePlaySession();

  const {
    stickToBottom,
    setStickToBottom,
    viewportRef,
    bottomRef,
    scrollToBottom,
    handleScroll,
    loadingOlder,
  } = useStickToBottom({
    threshold: 64,
    infiniteScroll: {
      loadThreshold: 200,
      debounceMs: 300,
      hasMore: oldestLoadedIndex > 0,
      isLoading: isLoadingOlderEntries,
      onLoadMore: () => loadOlderLogEntries(50),
    },
  });

  const { showIndicator: showZoomIndicator, isIndicatorVisible } = useZoom({
    zoom: fontSize,
    setZoom: setFontSize,
    step: 0.1,
    defaultZoom: 1,
    fadeDuration: 250,
  });

  const autoSaveData = useMemo(
    () => ({ log, stats, inventory, storyCards }),
    [log, stats, inventory, storyCards],
  );

  useAutoSave({
    data: autoSaveData,
    save: useCallback(() => save(taleId), [save, taleId]),
    debounceMs: 2000,
    disabled: loading,
    warnOnLeave: true,
  });

  // Load last played tale on mount
  useEffect(() => {
    if (!lastPlayedTaleId) return;

    if (!taleId || taleId !== lastPlayedTaleId) {
      load(lastPlayedTaleId).catch((err) => {
        console.error("Failed to auto-load tale in Play:", err);
        toast.error("Failed to load game session.");
      });
    }
  }, [lastPlayedTaleId, taleId, load]);

  useEffect(() => {
    if (loading) setStickToBottom(true);
  }, [loading, setStickToBottom]);

  useEffect(() => {
    if (lastTaleIdRef.current !== taleId) {
      hasAutoSentRef.current = false;
      lastTaleIdRef.current = taleId;
    }

    setStickToBottom(true);
    const timer = setTimeout(() => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [taleId, setStickToBottom, viewportRef]);

  useEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth",
      block: "end",
    });
  }, [log, loading, stickToBottom, bottomRef]);

  useEffect(() => {
    if (hasAutoSentRef.current || loading || !model || isLoadingTale) return;

    if (log.length === 1 && log[0].role === LogEntryRole.PLAYER) {
      const firstEntry = log[0];
      hasAutoSentRef.current = true;
      void executeLlmSend(
        firstEntry.text,
        firstEntry.mode ?? LogEntryMode.DIRECT,
      );
    }
  }, [log, loading, model, executeLlmSend, isLoadingTale]);

  const blocks = useMemo(() => groupLogEntriesIntoBlocks(log), [log]);

  const renderMainContent = () => {
    if (isLoadingTale) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-sm text-muted-foreground animate-pulse">
            <Trans>Loading adventure...</Trans>
          </div>
        </div>
      );
    }

    return (
      <div className="relative grid h-full grid-rows-[1fr_auto]">
        <PlayLogDisplay
          blocks={blocks}
          loadingOlder={loadingOlder}
          isStreaming={loading}
          currentlyEditingLogId={currentlyEditingLogId}
          setCurrentlyEditingLogId={setCurrentlyEditingLogId}
          updateLogEntry={updateLogEntry}
          viewportRef={viewportRef}
          bottomRef={bottomRef}
          onViewportScroll={handleScroll}
        />
        <PlayInputControls
          action={action}
          setAction={setAction}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onStop={handleStop}
          loading={loading}
          saving={saving}
          onContinue={handleContinue}
          onRetry={handleRetry}
        />
        {showZoomIndicator && (
          <div
            className={`pointer-events-none absolute top-4 end-4 z-50 transition-opacity duration-[250ms] ${
              isIndicatorVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="rounded-xs bg-background/95 px-2 py-1 shadow-lg border border-border backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {Math.round(fontSize * 100)}%
              </div>
            </div>
          </div>
        )}
        {!stickToBottom && !loading && (
          <div className="absolute bottom-20 end-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <Button
              variant="secondary"
              size="icon"
              className="h-10 w-10 rounded-full shadow-lg border border-border"
              onClick={() => scrollToBottom()}
              aria-label={t`Scroll to bottom`}
            >
              <ArrowDownIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0">
          <OutletWrapper />
        </div>
      </div>
    );
  };

  return (
    <>
      <MobilePlayHeader />
      {gameMode === GameMode.GM ? (
        <SidebarProvider
          defaultOpen={true}
          className="min-h-0 h-full"
          style={{ height: "100%" }}
        >
          <AppSidebar
            style={
              isMobilePlatform
                ? { paddingInlineStart: "env(safe-area-inset-left)" }
                : undefined
            }
          />
          <SidebarInset
            className="relative flex h-full flex-col overflow-hidden !rounded-none border-x bg-background/55 backdrop-blur-sm"
            style={
              isMobilePlatform
                ? { paddingInlineEnd: "env(safe-area-inset-right)" }
                : undefined
            }
          >
            {renderMainContent()}
          </SidebarInset>
        </SidebarProvider>
      ) : (
        <div
          className="relative flex h-full flex-col overflow-hidden bg-background/55 backdrop-blur-sm"
          style={
            isMobilePlatform
              ? {
                  paddingInlineStart: "env(safe-area-inset-left)",
                  paddingInlineEnd: "env(safe-area-inset-right)",
                }
              : undefined
          }
        >
          {renderMainContent()}
        </div>
      )}
    </>
  );
}

function OutletWrapper() {
  return <Outlet />;
}
