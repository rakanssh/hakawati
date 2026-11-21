import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSpeechRecorder } from "@/hooks/useSpeechRecorder";
import { isMobilePlatform as isMobilePlatformDevice } from "@/lib/platform";
import {
  MicrophonePermissionError,
  RecordingInterruptedError,
} from "@/lib/speech-recording";
import { cn } from "@/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowUpIcon, Loader2Icon, MicIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type SpeechRecorder = ReturnType<typeof useSpeechRecorder>;

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

export function useSpeechInput(onTranscript: (text: string) => void) {
  const { t } = useLingui();
  const recorder = useSpeechRecorder({
    onTranscript,
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
  const cancel = recorder.cancel;
  const active = recorder.status !== "idle";

  useEffect(() => {
    if (!active) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      cancel();
    };

    globalThis.addEventListener("keydown", handleEscapeKey, { capture: true });
    return () => {
      globalThis.removeEventListener("keydown", handleEscapeKey, {
        capture: true,
      });
    };
  }, [cancel, active]);

  return recorder;
}

export function SpeechButton({
  recorder,
  disabled,
  className,
}: {
  recorder: SpeechRecorder;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const { isRecording, isTranscribing } = recorder;
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
            "size-10 shrink-0 rounded-xs border shadow-none",
            className,
            isRecording
              ? "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
              : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={recorder.toggle}
          disabled={(disabled || isTranscribing) && !isRecording}
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
}

function SpeechCancelButton({
  recorder,
  label,
}: {
  recorder: SpeechRecorder;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="!h-9 !w-9 shrink-0 border border-destructive/35 bg-transparent text-destructive shadow-none hover:border-destructive/55 hover:bg-destructive/10 hover:text-destructive"
          onClick={recorder.cancel}
          aria-label={label}
        >
          <XIcon className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SpeechActivity({ recorder }: { recorder: SpeechRecorder }) {
  const { t } = useLingui();
  if (recorder.isRecording)
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
        <SpeechCancelButton recorder={recorder} label={t`Cancel recording`} />
        <span className="w-11 shrink-0 font-mono text-sm tabular-nums text-primary">
          {formatRecordingTime(recorder.elapsedSeconds)}
        </span>
        <RecordingWaveform level={recorder.level} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              className="!h-9 !w-9 shrink-0 bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
              onClick={recorder.stop}
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
  if (recorder.isTranscribing)
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
        <SpeechCancelButton
          recorder={recorder}
          label={t`Cancel transcription`}
        />
        <Loader2Icon className="h-4 w-4 shrink-0 animate-spin" />
        <span className="truncate">
          <Trans>Transcribing...</Trans>
        </span>
      </div>
    );
  return null;
}
