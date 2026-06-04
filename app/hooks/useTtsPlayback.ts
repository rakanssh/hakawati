import { getNarrationCacheKey, synthesizeNarration } from "@/services/llm";
import { useCallback, useEffect, useRef, useState } from "react";

export type TtsPlaybackStatus = "idle" | "loading" | "playing" | "paused";

export interface TtsPlaybackItem {
  id: string;
  text: string;
  label?: string;
}

interface UseTtsPlaybackParams {
  taleId: string;
  onError: (error: unknown) => void;
}

const sessionAudioCache = new Map<string, Blob>();

interface PlaybackState {
  status: TtsPlaybackStatus;
  current: TtsPlaybackItem | null;
  loadingItemId: string | null;
  currentTime: number;
  duration: number;
}

const initialPlaybackState: PlaybackState = {
  status: "idle",
  current: null,
  loadingItemId: null,
  currentTime: 0,
  duration: 0,
};

function getUsableDuration(
  audio: HTMLAudioElement,
  previousDuration: number,
  estimatedTime = 0,
): number {
  const metadataDuration =
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  const currentTime =
    Number.isFinite(audio.currentTime) && audio.currentTime > 0
      ? audio.currentTime
      : 0;
  return Math.max(
    previousDuration,
    metadataDuration,
    currentTime,
    estimatedTime,
  );
}

function nowMs(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError" || /abort|cancel/i.test(error.message);
  }
  return typeof error === "string" && /abort|cancel/i.test(error);
}

export function clearTtsSessionCache() {
  sessionAudioCache.clear();
}

export function useTtsPlayback({ taleId, onError }: UseTtsPlaybackParams) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<TtsPlaybackItem[]>([]);
  const progressIntervalRef = useRef<number | null>(null);
  const playbackStartedAtRef = useRef<number | null>(null);
  const playbackStartedOffsetRef = useRef(0);
  const mountedRef = useRef(false);
  const [state, setState] = useState<PlaybackState>(initialPlaybackState);
  const [queueLength, setQueueLength] = useState(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const resetAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    releaseObjectUrl();
  }, [releaseObjectUrl]);

  const stopProgressTimer = useCallback(() => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    playbackStartedAtRef.current = null;
    playbackStartedOffsetRef.current = 0;
  }, []);

  const updatePlaybackProgress = useCallback(() => {
    const startedAt = playbackStartedAtRef.current;
    if (startedAt === null) return;

    const estimatedTime =
      playbackStartedOffsetRef.current + (nowMs() - startedAt) / 1000;
    const audio = audioRef.current;

    setState((current) => {
      if (!current.current || current.status !== "playing") return current;
      const mediaTime =
        audio && Number.isFinite(audio.currentTime) && audio.currentTime > 0
          ? audio.currentTime
          : 0;
      const currentTime = Math.max(
        current.currentTime,
        mediaTime,
        estimatedTime,
      );
      return {
        ...current,
        currentTime,
        duration: audio
          ? getUsableDuration(audio, current.duration, currentTime)
          : Math.max(current.duration, currentTime),
      };
    });
  }, []);

  const startProgressTimer = useCallback(() => {
    const currentState = stateRef.current;
    playbackStartedOffsetRef.current = currentState.currentTime;
    playbackStartedAtRef.current = nowMs();
    if (progressIntervalRef.current === null) {
      progressIntervalRef.current = window.setInterval(
        updatePlaybackProgress,
        250,
      );
    }
    updatePlaybackProgress();
  }, [updatePlaybackProgress]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    setQueueLength(0);
    stopProgressTimer();
    resetAudio();
    setState(initialPlaybackState);
  }, [resetAudio, stopProgressTimer]);

  const playItemRef = useRef<(item: TtsPlaybackItem) => void>(() => undefined);

  const playQueued = useCallback(() => {
    const next = queueRef.current.shift();
    setQueueLength(queueRef.current.length);
    if (next) {
      playItemRef.current(next);
      return;
    }
    setState(initialPlaybackState);
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    mountedRef.current = true;

    const handleTimeUpdate = () => {
      setState((current) => ({
        ...current,
        currentTime: Math.max(current.currentTime, audio.currentTime || 0),
        duration: getUsableDuration(audio, current.duration),
      }));
    };
    const handleLoadedMetadata = () => {
      setState((current) => ({
        ...current,
        duration: getUsableDuration(audio, current.duration),
      }));
    };
    const handlePlay = () => {
      setState((current) => {
        if (!current.current) return current;
        const currentTime = Math.max(
          current.currentTime,
          audio.currentTime || 0,
        );
        return { ...current, status: "playing", currentTime };
      });
      startProgressTimer();
    };
    const handlePause = () => {
      if (audio.ended) return;
      stopProgressTimer();
      setState((current) =>
        current.current && current.status === "playing"
          ? { ...current, status: "paused" }
          : current,
      );
    };
    const handleEnded = () => {
      stopProgressTimer();
      releaseObjectUrl();
      playQueued();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      mountedRef.current = false;
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      stop();
      clearTtsSessionCache();
      audioRef.current = null;
    };
  }, [
    playQueued,
    releaseObjectUrl,
    startProgressTimer,
    stop,
    stopProgressTimer,
  ]);

  const playItem = useCallback(
    (item: TtsPlaybackItem) => {
      const cleanText = item.text.trim();
      if (!cleanText) return;

      abortRef.current?.abort();
      stopProgressTimer();
      const abort = new AbortController();
      abortRef.current = abort;
      resetAudio();
      setState({
        status: "loading",
        current: { ...item, text: cleanText },
        loadingItemId: item.id,
        currentTime: 0,
        duration: 0,
      });

      void (async () => {
        try {
          const cacheKey = getNarrationCacheKey(cleanText);
          let audio = sessionAudioCache.get(cacheKey);
          if (!audio) {
            audio = (await synthesizeNarration(cleanText, abort.signal)).audio;
            sessionAudioCache.set(cacheKey, audio);
          }
          if (abort.signal.aborted || !mountedRef.current) return;

          const objectUrl = URL.createObjectURL(audio);
          objectUrlRef.current = objectUrl;
          const player = audioRef.current;
          if (!player) return;
          player.src = objectUrl;
          await player.play();
          if (!abort.signal.aborted && mountedRef.current) {
            setState((current) => ({
              ...current,
              status: "playing",
              loadingItemId: null,
            }));
          }
        } catch (error) {
          if (!isAbortError(error)) {
            onError(error);
            playQueued();
          }
        } finally {
          if (abortRef.current === abort) {
            abortRef.current = null;
          }
          setState((current) =>
            current.loadingItemId === item.id
              ? { ...current, loadingItemId: null }
              : current,
          );
        }
      })();
    },
    [onError, playQueued, resetAudio, stopProgressTimer],
  );

  useEffect(() => {
    playItemRef.current = playItem;
  }, [playItem]);

  useEffect(() => {
    stop();
    clearTtsSessionCache();
  }, [stop, taleId]);

  const playNow = useCallback(
    (item: TtsPlaybackItem) => {
      queueRef.current = [];
      setQueueLength(0);
      playItem(item);
    },
    [playItem],
  );

  const enqueue = useCallback(
    (item: TtsPlaybackItem) => {
      const currentState = stateRef.current;
      if (currentState.current || currentState.status === "loading") {
        queueRef.current.push(item);
        setQueueLength(queueRef.current.length);
        return;
      }
      playItem(item);
    },
    [playItem],
  );

  const pause = useCallback(() => {
    updatePlaybackProgress();
    audioRef.current?.pause();
  }, [updatePlaybackProgress]);

  const resume = useCallback(() => {
    void audioRef.current?.play().catch(onError);
  }, [onError]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const nextTime = Math.max(0, seconds);
    audio.currentTime = Math.min(nextTime, audio.duration || nextTime);
    playbackStartedOffsetRef.current = nextTime;
    playbackStartedAtRef.current = nowMs();
    setState((current) => ({
      ...current,
      currentTime: nextTime,
      duration: Math.max(current.duration, nextTime),
    }));
  }, []);

  return {
    ...state,
    activeItemId: state.current?.id ?? null,
    queueLength,
    isVisible: state.status !== "idle" || queueLength > 0,
    playNow,
    enqueue,
    pause,
    resume,
    seek,
    stop,
  };
}
