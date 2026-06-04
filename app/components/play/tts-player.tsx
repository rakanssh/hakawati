import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2Icon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { useLingui } from "@lingui/react/macro";

interface TtsPlayerProps {
  visible: boolean;
  status: "idle" | "loading" | "playing" | "paused";
  currentTime: number;
  duration: number;
  onPause: () => void;
  onResume: () => void;
  onSeek: (seconds: number) => void;
  onStop: () => void;
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function TtsPlayer({
  visible,
  status,
  currentTime,
  duration,
  onPause,
  onResume,
  onSeek,
  onStop,
}: TtsPlayerProps) {
  const { t } = useLingui();
  if (!visible) return null;

  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const safeDuration = duration > 0 ? duration : 0;
  const progress = safeDuration > 0 ? currentTime : 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-xs border border-border/75 bg-background/95 px-2 py-2 shadow-lg backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="!h-9 !w-9 shrink-0"
          onClick={isPlaying ? onPause : onResume}
          disabled={isLoading || status === "idle"}
          aria-label={isPlaying ? t`Pause narration` : t`Play narration`}
        >
          {isLoading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </Button>
        <span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatAudioTime(progress)}
        </span>
        <input
          type="range"
          min={0}
          max={safeDuration || 0}
          step={0.1}
          value={Math.min(progress, safeDuration || progress)}
          disabled={safeDuration <= 0}
          onChange={(event) => onSeek(Number(event.target.value))}
          className={cn(
            "h-1 flex-1 appearance-none rounded-full bg-muted accent-primary",
            "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
          )}
          aria-label={t`Seek narration`}
        />
        <span className="w-9 shrink-0 text-end font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatAudioTime(safeDuration)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="!h-9 !w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onStop}
          aria-label={t`Close narration player`}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
