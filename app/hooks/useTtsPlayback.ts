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

interface CachedNarrationAudio {
  audio: Blob;
  duration: number;
}

type AudioContextFactory =
  | (new (contextOptions?: AudioContextOptions) => AudioContext)
  | ((contextOptions?: AudioContextOptions) => AudioContext);

const sessionAudioCache = new Map<string, CachedNarrationAudio>();

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

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read synthesized audio."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Could not read synthesized audio."));
    });
    reader.readAsArrayBuffer(blob);
  });
}

async function createSeekableAudio(audio: Blob): Promise<CachedNarrationAudio> {
  const globalAudioContext: AudioContextFactory | undefined =
    "AudioContext" in globalThis
      ? (globalThis.AudioContext as AudioContextFactory | undefined)
      : undefined;
  const windowAudioContext: AudioContextFactory | undefined =
    typeof window !== "undefined"
      ? ((window as Window & typeof globalThis).AudioContext as
          | AudioContextFactory
          | undefined)
      : undefined;
  const webkitAudioContext: AudioContextFactory | undefined =
    typeof window !== "undefined"
      ? (
          window as Window &
            typeof globalThis & {
              webkitAudioContext?: AudioContextFactory;
            }
        ).webkitAudioContext
      : undefined;
  const AudioContextConstructor = globalAudioContext
    ? globalAudioContext
    : (windowAudioContext ?? webkitAudioContext);

  if (!AudioContextConstructor) {
    return { audio, duration: 0 };
  }

  let context: AudioContext | null = null;
  try {
    try {
      context = new (AudioContextConstructor as new (
        contextOptions?: AudioContextOptions,
      ) => AudioContext)();
    } catch {
      context = (
        AudioContextConstructor as (
          contextOptions?: AudioContextOptions,
        ) => AudioContext
      )();
    }
    const buffer = await context.decodeAudioData(
      await blobToArrayBuffer(audio),
    );
    const duration =
      Number.isFinite(buffer.duration) && buffer.duration > 0
        ? buffer.duration
        : 0;
    if (duration <= 0) {
      return { audio, duration: 0 };
    }
    return {
      audio: encodeAudioBufferAsWav(buffer),
      duration,
    };
  } catch {
    return { audio, duration: 0 };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

function encodeAudioBufferAsWav(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const sampleCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = sampleCount * blockAlign;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = Math.max(-1, Math.min(1, channels[channel][sample] ?? 0));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([wav], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
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
  const pendingPlaybackStartOffsetRef = useRef<number | null>(null);
  const currentCacheKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const [state, setState] = useState<PlaybackState>(initialPlaybackState);
  const [queueLength, setQueueLength] = useState(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setPlaybackState = useCallback(
    (
      nextState: PlaybackState | ((current: PlaybackState) => PlaybackState),
    ) => {
      setState((current) => {
        const next =
          typeof nextState === "function" ? nextState(current) : nextState;
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

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

  const rememberCachedDuration = useCallback((duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const cacheKey = currentCacheKeyRef.current;
    if (!cacheKey) return;
    const cached = sessionAudioCache.get(cacheKey);
    if (!cached || cached.duration >= duration) return;
    cached.duration = duration;
  }, []);

  const updatePlaybackProgress = useCallback(() => {
    const startedAt = playbackStartedAtRef.current;
    if (startedAt === null) return;

    const estimatedTime =
      playbackStartedOffsetRef.current + (nowMs() - startedAt) / 1000;
    const audio = audioRef.current;

    setPlaybackState((current) => {
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
      const duration = audio
        ? getUsableDuration(audio, current.duration, currentTime)
        : Math.max(current.duration, currentTime);
      rememberCachedDuration(duration);
      return {
        ...current,
        currentTime,
        duration,
      };
    });
  }, [rememberCachedDuration, setPlaybackState]);

  const startProgressTimer = useCallback(
    (offset?: number) => {
      playbackStartedOffsetRef.current = offset ?? stateRef.current.currentTime;
      playbackStartedAtRef.current = nowMs();
      if (progressIntervalRef.current === null) {
        progressIntervalRef.current = window.setInterval(
          updatePlaybackProgress,
          250,
        );
      }
      updatePlaybackProgress();
    },
    [updatePlaybackProgress],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    setQueueLength(0);
    pendingPlaybackStartOffsetRef.current = null;
    currentCacheKeyRef.current = null;
    stopProgressTimer();
    resetAudio();
    setPlaybackState(initialPlaybackState);
  }, [resetAudio, setPlaybackState, stopProgressTimer]);

  const playItemRef = useRef<(item: TtsPlaybackItem) => void>(() => undefined);

  const playQueued = useCallback(() => {
    const next = queueRef.current.shift();
    setQueueLength(queueRef.current.length);
    if (next) {
      playItemRef.current(next);
      return;
    }
    currentCacheKeyRef.current = null;
    setPlaybackState(initialPlaybackState);
  }, [setPlaybackState]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    mountedRef.current = true;

    const handleTimeUpdate = () => {
      setPlaybackState((current) => {
        const currentTime = Math.max(
          current.currentTime,
          audio.currentTime || 0,
        );
        const duration = getUsableDuration(audio, current.duration);
        rememberCachedDuration(duration);
        return {
          ...current,
          currentTime,
          duration,
        };
      });
    };
    const handleLoadedMetadata = () => {
      setPlaybackState((current) => {
        const duration = getUsableDuration(audio, current.duration);
        rememberCachedDuration(duration);
        return {
          ...current,
          duration,
        };
      });
    };
    const handlePlay = () => {
      const pendingStartOffset = pendingPlaybackStartOffsetRef.current;
      pendingPlaybackStartOffsetRef.current = null;
      const mediaTime =
        Number.isFinite(audio.currentTime) && audio.currentTime > 0
          ? audio.currentTime
          : 0;
      const progressOffset =
        pendingStartOffset !== null
          ? Math.max(pendingStartOffset, mediaTime)
          : Math.max(stateRef.current.currentTime, mediaTime);
      setPlaybackState((current) => {
        if (!current.current) return current;
        const currentTime =
          pendingStartOffset !== null
            ? progressOffset
            : Math.max(current.currentTime, mediaTime);
        return { ...current, status: "playing", currentTime };
      });
      startProgressTimer(progressOffset);
    };
    const handlePause = () => {
      if (audio.ended) return;
      stopProgressTimer();
      setPlaybackState((current) =>
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
    rememberCachedDuration,
    releaseObjectUrl,
    setPlaybackState,
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
      pendingPlaybackStartOffsetRef.current = null;
      currentCacheKeyRef.current = null;
      const abort = new AbortController();
      abortRef.current = abort;
      resetAudio();
      setPlaybackState({
        status: "loading",
        current: { ...item, text: cleanText },
        loadingItemId: item.id,
        currentTime: 0,
        duration: 0,
      });

      void (async () => {
        try {
          const cacheKey = getNarrationCacheKey(cleanText);
          let cached = sessionAudioCache.get(cacheKey);
          if (!cached) {
            const synthesized = await synthesizeNarration(
              cleanText,
              abort.signal,
            );
            cached = await createSeekableAudio(synthesized.audio);
            sessionAudioCache.set(cacheKey, cached);
          }
          if (abort.signal.aborted || !mountedRef.current) return;

          currentCacheKeyRef.current = cacheKey;
          setPlaybackState((current) =>
            current.current?.id === item.id
              ? { ...current, duration: cached.duration }
              : current,
          );

          const objectUrl = URL.createObjectURL(cached.audio);
          objectUrlRef.current = objectUrl;
          const player = audioRef.current;
          if (!player) return;
          player.src = objectUrl;
          pendingPlaybackStartOffsetRef.current = 0;
          await player.play();
          if (!abort.signal.aborted && mountedRef.current) {
            setPlaybackState((current) => ({
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
          setPlaybackState((current) =>
            current.loadingItemId === item.id
              ? { ...current, loadingItemId: null }
              : current,
          );
        }
      })();
    },
    [onError, playQueued, resetAudio, setPlaybackState, stopProgressTimer],
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

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(seconds)) return;
      const requestedTime = Math.max(0, seconds);
      const effectiveDuration = stateRef.current.duration;
      const nextTime =
        effectiveDuration > 0
          ? Math.min(requestedTime, effectiveDuration)
          : requestedTime;
      audio.currentTime = nextTime;
      playbackStartedOffsetRef.current = nextTime;
      playbackStartedAtRef.current = nowMs();
      setPlaybackState((current) => {
        const duration = Math.max(current.duration, nextTime);
        rememberCachedDuration(duration);
        return {
          ...current,
          currentTime: nextTime,
          duration,
        };
      });
    },
    [rememberCachedDuration, setPlaybackState],
  );

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
