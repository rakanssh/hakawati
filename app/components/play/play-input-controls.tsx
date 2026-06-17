import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ChevronUpIcon,
  CheckIcon,
  Loader2Icon,
  MicIcon,
  ArrowUpIcon,
  XIcon,
  SquareIcon,
} from "lucide-react";
import { LogEntryMode } from "@/types/log.type";
import {
  ContinueControl,
  RedoControl,
  RetryControl,
  UndoControl,
  useLogControlShortcuts,
} from "@/components/play/log";
import { getPlaceholderMessage, Action } from "@/lib/play-utils";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  appendTranscriptToInput,
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

const WAVEFORM_MAX_FITTED_BAR_COUNT = 260;
const WAVEFORM_BAR_WIDTH_PX = 2;
const WAVEFORM_BAR_GAP_PX = 2;
const WAVEFORM_BAR_SLOT_WIDTH_PX = WAVEFORM_BAR_WIDTH_PX + WAVEFORM_BAR_GAP_PX;
const WAVEFORM_UPDATE_INTERVAL_MS = 55;
const WAVEFORM_NOISE_FLOOR = 0.008;
const WAVEFORM_INPUT_GAIN = 9.5;
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

  const actionModeLabels = {
    [LogEntryMode.DO]: t`Act`,
    [LogEntryMode.SAY]: t`Say`,
    [LogEntryMode.STORY]: t`Story`,
    [LogEntryMode.DIRECT]: t`Direct`,
  } satisfies Record<InputActionMode, string>;

  const renderModeIcon = (mode: InputActionMode) => {
    const Icon = ACTION_MODE_ICONS[mode];
    return <Icon className="w-4 h-4" />;
  };

  const currentActionLabel = actionModeLabels[currentActionMode];
  const composerControlsLocked = speechRecorder.status !== "idle";
  const canStopGeneration = loading && !!onStop;
  const quietIconButtonClass =
    "composer-command-button !h-10 !w-10 min-w-10 border border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:border-transparent hover:bg-muted/35 hover:text-foreground md:!h-9 md:!w-9";
  const subtleActionSelectorClass =
    "composer-command-button composer-command-selector !h-10 !w-auto min-w-10 gap-1.5 rounded-xs border border-transparent bg-transparent px-2.5 text-muted-foreground shadow-none hover:border-border/70 hover:bg-muted/35 hover:text-foreground focus-visible:border-ring/55 md:!h-9 md:px-2";
  const composerSurfaceClass =
    "flex min-h-[6.25rem] min-w-0 overflow-hidden rounded-xs border border-border/75 bg-[var(--composer-background)] p-1.5 shadow-lg shadow-background/25 transition-[border-color,box-shadow] focus-within:border-ring/55 focus-within:ring-2 focus-within:ring-ring/18 md:min-h-[6rem]";
  useLogControlShortcuts({
    handleUndo: onUndo,
    handleRedo: onRedo,
    handleRetry: onRetry,
    handleStop: onStop,
    loading,
    saving,
  });

  const renderModeMenu = ({
    className,
  }: {
    className?: string;
  } = {}) => (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(subtleActionSelectorClass, className)}
              aria-label={t`Select action mode`}
              title={currentActionLabel}
            >
              <span className="flex items-center gap-1.5">
                {renderModeIcon(currentActionMode)}
              </span>
              <span className="composer-command-select-affordance flex items-center text-muted-foreground">
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{currentActionLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" className="min-w-36">
        {ACTION_MODES.map((mode) => (
          <DropdownMenuItem
            key={mode}
            onClick={() =>
              setAction({
                type: mode,
                isRolling: action.isRolling,
              })
            }
            className={cn(
              action.type === mode && "bg-accent text-accent-foreground",
            )}
          >
            {renderModeIcon(mode)}
            <span>{actionModeLabels[mode]}</span>
            {action.type === mode && <CheckIcon className="ms-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderDiceToggle = (className?: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "!h-10 !w-10 shrink-0 border shadow-none md:!h-9 md:!w-9",
            action.isRolling
              ? "border-success/45 bg-success/10 text-success hover:bg-success/15 hover:text-success"
              : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/45 hover:text-foreground",
            className,
          )}
          onClick={() =>
            setAction({
              type: action.type,
              isRolling: !action.isRolling,
            })
          }
          disabled={loading}
          aria-label={t`Roll a dice`}
        >
          <DicesIcon strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Trans>Roll a dice</Trans>
      </TooltipContent>
    </Tooltip>
  );

  const renderSpeechButton = (className?: string) => {
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
            className={cn(
              "!h-10 !w-10 shrink-0 border shadow-none md:!h-9 md:!w-9",
              isRecording
                ? "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/45 hover:text-foreground",
              className,
            )}
            onClick={speechRecorder.toggle}
            disabled={(loading || saving || isTranscribing) && !isRecording}
            aria-label={label}
          >
            {isTranscribing ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <MicIcon
                strokeWidth={1.5}
                className={cn(isRecording && "animate-pulse")}
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
      className="max-h-[240px] min-h-10 resize-none border-0 !bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:py-2"
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

  const renderSubmitButton = (className?: string) => (
    <Button
      type={canStopGeneration ? "button" : "submit"}
      onClick={canStopGeneration ? onStop : onSubmit}
      disabled={saving || (loading && !canStopGeneration)}
      size="icon"
      className={cn("!h-10 !w-10 shrink-0 md:!h-9 md:!w-9", className)}
      aria-label={canStopGeneration ? t`Stop generating` : t`Submit action`}
    >
      {canStopGeneration ? (
        <SquareIcon className="w-4 h-4" />
      ) : saving ? (
        <SaveIcon className="w-4 h-4 animate-spin" />
      ) : (
        <SendIcon className="w-4 h-4" />
      )}
    </Button>
  );

  const renderInputSurface = () => (
    <div className={composerSurfaceClass}>
      {speechRecorder.isRecording ? (
        renderRecordingComposer()
      ) : speechRecorder.isTranscribing ? (
        renderTranscribingComposer()
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="min-w-0">
            <div className="min-w-0 flex-1">{renderTextArea()}</div>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              {renderModifierControls("min-w-0")}
              {renderHistoryControls()}
              {renderGenerationControls()}
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1.5">
              {renderSubmitControls()}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderModifierControls = (className?: string) => (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 md:gap-1",
        composerControlsLocked && "pointer-events-none opacity-60",
        className,
      )}
    >
      {renderModeMenu()}
      {renderDiceToggle()}
    </div>
  );

  const renderHistoryControls = (className?: string) => (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center gap-0 md:gap-0.5",
        composerControlsLocked && "pointer-events-none opacity-60",
        className,
      )}
    >
      <UndoControl
        handleUndo={onUndo}
        loading={loading}
        saving={saving}
        className={quietIconButtonClass}
      />
      <RetryControl
        handleRetry={onRetry}
        loading={loading}
        saving={saving}
        className={quietIconButtonClass}
      />
      <RedoControl
        handleRedo={onRedo}
        loading={loading}
        saving={saving}
        className={quietIconButtonClass}
      />
    </div>
  );

  const renderGenerationControls = (className?: string) => (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-0.5 md:gap-1",
        composerControlsLocked && "pointer-events-none opacity-60",
        className,
      )}
    >
      <ContinueControl
        onContinue={onContinue}
        onStop={onStop}
        loading={loading}
        saving={saving}
        className={quietIconButtonClass}
      />
    </div>
  );

  const renderSubmitControls = (className?: string) => (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-0",
        composerControlsLocked && "pointer-events-none opacity-60",
        className,
      )}
    >
      {renderSpeechButton("rounded-e-none")}
      {renderSubmitButton("rounded-s-none")}
    </div>
  );

  const renderComposer = () => (
    <div className="composer-command-tier mx-auto w-full max-w-5xl">
      {renderInputSurface()}
    </div>
  );

  return (
    <div
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
