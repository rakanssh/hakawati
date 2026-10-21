import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DicesIcon,
  HandIcon,
  SendIcon,
  SpeechIcon,
  BookIcon,
  MegaphoneIcon,
  SaveIcon,
  Loader2Icon,
  MicIcon,
  ArrowUpIcon,
  XIcon,
  SquareIcon,
  TriangleIcon,
} from "lucide-react";
import { LogEntryMode } from "@/types/log.type";
import {
  RedoControl,
  RetryControl,
  UndoControl,
  useLogControlShortcuts,
} from "@/components/play/log";
import { getPlaceholderMessage, Action } from "@/lib/play-utils";
import { cn } from "@/lib/utils";
import {
  isMobilePlatform as isMobilePlatformDevice,
  useIsMobile,
} from "@/hooks/useIsMobile";
import {
  appendTranscriptToInput,
  MicrophonePermissionError,
  RecordingInterruptedError,
  useSpeechRecorder,
} from "@/hooks/useSpeechRecorder";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

interface PlayInputControlsProps {
  action: Action;
  setAction: (action: Action) => void;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  onSubmit: () => void;
  onStop?: () => void;
  loading: boolean;
  saving: boolean;
  onContinue: () => void;
  onRetry: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const ACTION_MODES = [
  LogEntryMode.DO,
  LogEntryMode.SAY,
  LogEntryMode.STORY,
  LogEntryMode.DIRECT,
] as const;

type InputActionMode = (typeof ACTION_MODES)[number];

const ACTION_MODE_ICONS = {
  [LogEntryMode.DO]: HandIcon,
  [LogEntryMode.SAY]: SpeechIcon,
  [LogEntryMode.STORY]: BookIcon,
  [LogEntryMode.DIRECT]: MegaphoneIcon,
} satisfies Record<InputActionMode, typeof HandIcon>;

// The open tab wears the colour the log gives that kind of turn.
const ACTION_MODE_TAB_COLORS = {
  [LogEntryMode.DO]: "text-log-do",
  [LogEntryMode.SAY]: "text-log-say",
  [LogEntryMode.STORY]: "text-primary",
  [LogEntryMode.DIRECT]: "text-log-direct",
} satisfies Record<InputActionMode, string>;

const WAVEFORM_MAX_FITTED_BAR_COUNT = 260;
const WAVEFORM_BAR_WIDTH_PX = 2;
const WAVEFORM_BAR_GAP_PX = 2;
const WAVEFORM_BAR_SLOT_WIDTH_PX = WAVEFORM_BAR_WIDTH_PX + WAVEFORM_BAR_GAP_PX;
const WAVEFORM_UPDATE_INTERVAL_MS = 55;
const WAVEFORM_NOISE_FLOOR = 0.008;
// Phone mics sit close to the mouth and add their own gain, so speech that a
// desktop mic barely registers already fills the waveform there.
const WAVEFORM_INPUT_GAIN = isMobilePlatformDevice() ? 2 : 9.5;
const WAVEFORM_MIN_HEIGHT_PX = 3;
const WAVEFORM_HEIGHT_RANGE_PX = 31;
const WAVEFORM_MIN_OPACITY = 0.48;
const WAVEFORM_OPACITY_RANGE = 0.52;

function formatRecordingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function amplifyWaveformLevel(level: number): number {
  const clampedLevel = Math.min(1, Math.max(0, level));
  const normalizedLevel =
    (clampedLevel - WAVEFORM_NOISE_FLOOR) / (1 - WAVEFORM_NOISE_FLOOR);

  if (normalizedLevel <= 0) return 0;

  return Math.min(1, Math.pow(normalizedLevel * WAVEFORM_INPUT_GAIN, 0.65));
}

function getFittedWaveformBarCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;

  return Math.min(
    WAVEFORM_MAX_FITTED_BAR_COUNT,
    Math.floor((width + WAVEFORM_BAR_GAP_PX) / WAVEFORM_BAR_SLOT_WIDTH_PX),
  );
}

function appendWaveformBar(bars: number[], nextLevel: number): number[] {
  if (bars.length === 0) return bars;
  return [...bars.slice(1), nextLevel];
}

function createEmptyWaveformBars(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}

function RecordingWaveform({ level }: { level: number }) {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const levelRef = useRef(level);
  const [bars, setBars] = useState<number[]>([]);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setBars((currentBars) =>
        appendWaveformBar(currentBars, amplifyWaveformLevel(levelRef.current)),
      );
    }, WAVEFORM_UPDATE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const waveformElement = waveformRef.current;
    if (!waveformElement) return;

    const syncBarCount = (width = waveformElement.clientWidth) => {
      const barCount = getFittedWaveformBarCount(width);
      setBars((currentBars) =>
        currentBars.length === barCount
          ? currentBars
          : createEmptyWaveformBars(barCount),
      );
    };

    syncBarCount();

    if (!("ResizeObserver" in window)) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      syncBarCount(entry.contentRect.width);
    });

    resizeObserver.observe(waveformElement);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      ref={waveformRef}
      dir="ltr"
      className="flex h-10 min-w-0 flex-1 items-center overflow-hidden"
      style={{ gap: `${WAVEFORM_BAR_GAP_PX}px` }}
      aria-hidden="true"
    >
      {bars.map((barLevel, index) => (
        <span
          key={index}
          className="shrink-0 rounded-full bg-primary/90"
          style={{
            width: `${WAVEFORM_BAR_WIDTH_PX}px`,
            height: `${Math.round(
              WAVEFORM_MIN_HEIGHT_PX + barLevel * WAVEFORM_HEIGHT_RANGE_PX,
            )}px`,
            opacity: WAVEFORM_MIN_OPACITY + barLevel * WAVEFORM_OPACITY_RANGE,
          }}
        />
      ))}
    </div>
  );
}

function isInputActionMode(mode: LogEntryMode): mode is InputActionMode {
  return ACTION_MODES.includes(mode as InputActionMode);
}

export function PlayInputControls({
  action,
  setAction,
  input,
  setInput,
  onSubmit,
  onStop,
  loading,
  saving,
  onContinue,
  onRetry,
  onUndo,
  onRedo,
}: PlayInputControlsProps) {
  const { t } = useLingui();
  const { isMobilePlatform } = useIsMobile();
  const speechRecorder = useSpeechRecorder({
    onTranscript: (text) => {
      setInput((current) => appendTranscriptToInput(current, text));
    },
    onError: (error) => {
      if (error instanceof MicrophonePermissionError) {
        toast.error(
          error.blocked
            ? t`Microphone access is turned off for Hakawati. Allow it in your device settings to record speech.`
            : t`Hakawati needs microphone access to record speech.`,
        );
        return;
      }
      if (error instanceof RecordingInterruptedError) {
        toast.info(t`Recording stopped because you left Hakawati.`);
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : t`Failed to transcribe speech.`;
      toast.error(message);
    },
  });
  const cancelSpeechRecording = speechRecorder.cancel;
  const isSpeechRecording = speechRecorder.isRecording;

  useEffect(() => {
    if (!isSpeechRecording) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      cancelSpeechRecording();
    };

    globalThis.addEventListener("keydown", handleEscapeKey, { capture: true });
    return () => {
      globalThis.removeEventListener("keydown", handleEscapeKey, {
        capture: true,
      });
    };
  }, [cancelSpeechRecording, isSpeechRecording]);

  const currentActionMode = isInputActionMode(action.type)
    ? action.type
    : LogEntryMode.DO;

  const actionModeTabLabels = {
    [LogEntryMode.DO]: t`Act`,
    [LogEntryMode.SAY]: t`Speak`,
    [LogEntryMode.STORY]: t`Story`,
    [LogEntryMode.DIRECT]: t`Direct`,
  } satisfies Record<InputActionMode, string>;

  const composerControlsLocked = speechRecorder.status !== "idle";
  const canStopGeneration = loading && !!onStop;
  const composerSurfaceClass =
    "flex min-h-[6.25rem] min-w-0 overflow-hidden rounded-lg rounded-ss-none border border-border/75 bg-[var(--composer-background)] p-1.5 shadow-lg shadow-background/25 transition-[border-color,box-shadow] focus-within:border-ring/55 focus-within:ring-2 focus-within:ring-ring/18 md:min-h-[6rem]";
  useLogControlShortcuts({
    handleUndo: onUndo,
    handleRedo: onRedo,
    handleRetry: onRetry,
    handleStop: onStop,
    loading,
    saving,
  });

  // The open tab joins the input box; on phones the others shrink to icons.
  const renderModeTabs = () => (
    <div
      role="group"
      aria-label={t`Select action mode`}
      data-composer-mode=""
      className={cn(
        // Themes restyle the tab type here, so the tabs inherit its size.
        "flex min-w-0 items-end gap-1 text-sm",
        composerControlsLocked && "pointer-events-none opacity-60",
      )}
    >
      {ACTION_MODES.map((mode) => {
        const active = currentActionMode === mode;
        const Icon = ACTION_MODE_ICONS[mode];
        const label = actionModeTabLabels[mode];
        const iconOnly = isMobilePlatform && !active;

        return (
          <button
            key={mode}
            type="button"
            data-composer-tab=""
            data-active={active ? "" : undefined}
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() =>
              setAction({
                type: mode,
                isRolling: action.isRolling,
              })
            }
            className={cn(
              "flex shrink-0 items-center justify-center gap-1.5 rounded-t-lg border border-b-0 font-medium transition-colors",
              active
                ? cn(
                    "relative z-10 -mb-px border-border/75 bg-[var(--composer-background)] font-semibold",
                    ACTION_MODE_TAB_COLORS[mode],
                  )
                : "border-transparent bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              isMobilePlatform
                ? active
                  ? "h-11 px-3.5"
                  : "h-10 w-11"
                : active
                  ? "h-10 px-4"
                  : "h-9 px-3.5",
            )}
          >
            <Icon className="size-[1.125rem]" />
            {!iconOnly && (
              <span className={cn(!active && "composer-command-label")}>
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Rolling changes the kind of turn, like the mode, so it sits beside the tabs.
  const renderRollToggle = () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-composer-roll=""
          aria-pressed={action.isRolling}
          aria-label={t`Roll a dice`}
          onClick={() =>
            setAction({
              type: action.type,
              isRolling: !action.isRolling,
            })
          }
          disabled={loading}
          className={cn(
            "mb-1 flex shrink-0 items-center justify-center gap-1.5 rounded-full border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
            isMobilePlatform ? "size-11" : "h-9 px-3.5",
            action.isRolling
              ? "border-success/50 bg-success/12 text-success"
              : "border-border/75 bg-[var(--composer-background)] text-muted-foreground hover:bg-muted hover:text-foreground",
            composerControlsLocked && "pointer-events-none opacity-60",
          )}
        >
          <DicesIcon className="size-[1.125rem]" strokeWidth={1.5} />
          {!isMobilePlatform && (
            <span className="composer-command-label">{t`Roll`}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Roll a dice</Trans>
      </TooltipContent>
    </Tooltip>
  );

  const renderSpeechButton = () => {
    const isRecording = speechRecorder.status === "recording";
    const isTranscribing = speechRecorder.status === "transcribing";
    const label = isRecording
      ? t`Stop recording`
      : isTranscribing
        ? t`Transcribing...`
        : t`Record speech`;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-composer-mic=""
            className={cn(
              "shrink-0 rounded-full border shadow-none",
              isMobilePlatform ? "size-[2.875rem]" : "size-10",
              isRecording
                ? "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={speechRecorder.toggle}
            disabled={(loading || saving || isTranscribing) && !isRecording}
            aria-label={label}
          >
            {isTranscribing ? (
              <Loader2Icon className="size-5 animate-spin" />
            ) : (
              <MicIcon
                strokeWidth={1.5}
                className={cn("size-5", isRecording && "animate-pulse")}
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const renderTextArea = () => (
    <Textarea
      data-composer-input=""
      placeholder={t(getPlaceholderMessage(action))}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (loading || saving) return;
          onSubmit();
        }
      }}
      rows={1}
      className="max-h-[240px] min-h-10 resize-none border-0 !bg-transparent px-2.5 py-2.5 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:py-2 md:text-lg"
      aria-label={t`Enter your action`}
    />
  );

  const renderRecordingComposer = () => (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="!h-9 !w-9 shrink-0 border border-destructive/35 bg-transparent text-destructive shadow-none hover:border-destructive/55 hover:bg-destructive/10 hover:text-destructive"
            onClick={speechRecorder.cancel}
            aria-label={t`Cancel recording`}
          >
            <XIcon className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <Trans>Cancel recording</Trans>
        </TooltipContent>
      </Tooltip>
      <span className="w-11 shrink-0 font-mono text-sm tabular-nums text-primary">
        {formatRecordingTime(speechRecorder.elapsedSeconds)}
      </span>
      <RecordingWaveform level={speechRecorder.level} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            className="!h-9 !w-9 shrink-0 bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
            onClick={speechRecorder.stop}
            aria-label={t`Stop and transcribe`}
          >
            <ArrowUpIcon className="h-4 w-4" strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <Trans>Stop and transcribe</Trans>
        </TooltipContent>
      </Tooltip>
    </div>
  );

  const renderTranscribingComposer = () => (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
      <Loader2Icon className="h-4 w-4 shrink-0 animate-spin" />
      <span className="truncate">
        <Trans>Transcribing...</Trans>
      </span>
    </div>
  );

  // With nothing typed, the send button continues the story instead.
  const continuesStory = !canStopGeneration && !input.trim();

  const renderSubmitButton = () => (
    <Button
      type={canStopGeneration ? "button" : "submit"}
      onClick={
        canStopGeneration ? onStop : continuesStory ? onContinue : onSubmit
      }
      disabled={saving || (loading && !canStopGeneration)}
      size="icon"
      data-composer-send=""
      className={cn(
        "shrink-0 rounded-full",
        isMobilePlatform ? "size-[3.375rem]" : "size-12",
      )}
      aria-label={
        canStopGeneration
          ? t`Stop generating`
          : continuesStory
            ? t`Continue`
            : t`Submit action`
      }
    >
      {canStopGeneration ? (
        <SquareIcon className="size-4 fill-current" />
      ) : saving ? (
        <SaveIcon className="size-5 animate-spin" />
      ) : continuesStory ? (
        // A visual novel's "advance" marker.
        <TriangleIcon className="size-4 rotate-180 fill-current" />
      ) : (
        <SendIcon className="size-5" />
      )}
    </Button>
  );

  const renderHistoryControls = () => {
    // Phones get bigger icons; desktop has room to name each action.
    const buttonClass = isMobilePlatform ? "size-12" : "h-10 px-3";
    return (
      <div
        className={cn(
          "flex min-w-0 items-center",
          isMobilePlatform ? "-ms-1" : "gap-0.5",
          composerControlsLocked && "pointer-events-none opacity-60",
        )}
      >
        <UndoControl
          handleUndo={onUndo}
          loading={loading}
          saving={saving}
          showLabel={!isMobilePlatform}
          className={buttonClass}
        />
        <RetryControl
          handleRetry={onRetry}
          loading={loading}
          saving={saving}
          showLabel={!isMobilePlatform}
          className={buttonClass}
        />
        <RedoControl
          handleRedo={onRedo}
          loading={loading}
          saving={saving}
          showLabel={!isMobilePlatform}
          className={buttonClass}
        />
      </div>
    );
  };

  const renderSubmitControls = () => (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2",
        composerControlsLocked && "pointer-events-none opacity-60",
      )}
    >
      {renderSpeechButton()}
      {renderSubmitButton()}
    </div>
  );

  const renderInputSurface = () => (
    <div data-composer-surface="" className={composerSurfaceClass}>
      {speechRecorder.isRecording ? (
        renderRecordingComposer()
      ) : speechRecorder.isTranscribing ? (
        renderTranscribingComposer()
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="min-w-0">{renderTextArea()}</div>
          <div className="composer-command-controls flex min-w-0 items-center justify-between gap-2">
            {renderHistoryControls()}
            {renderSubmitControls()}
          </div>
        </div>
      )}
    </div>
  );

  const renderComposer = () => (
    <div
      data-composer-frame=""
      className="composer-command-tier mx-auto w-full max-w-(--play-composer-max)"
    >
      <div className="flex min-w-0 items-end justify-between gap-2">
        {renderModeTabs()}
        {renderRollToggle()}
      </div>
      {renderInputSurface()}
    </div>
  );

  return (
    <div
      data-composer=""
      className={cn(
        "pointer-events-auto z-20 w-full",
        isMobilePlatform ? "px-2 pt-2" : "p-3",
      )}
      style={
        isMobilePlatform
          ? { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }
          : undefined
      }
    >
      {renderComposer()}
    </div>
  );
}
