import { transcribeSpeech } from "@/services/llm";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechRecorderStatus = "idle" | "recording" | "transcribing";

interface UseSpeechRecorderParams {
  onTranscript: (text: string) => void;
  onError: (error: unknown) => void;
}

interface NativeSpeechRecording {
  mimeType: string;
  dataBase64: string;
}

interface NativeSpeechLevel {
  level: number;
}

const RECORDING_STATS_POLL_INTERVAL_MS = 50;

export function normalizeMicrophoneError(error: unknown): Error {
  if (typeof error === "string") {
    return new Error(error);
  }
  return error instanceof Error
    ? error
    : new Error("Failed to start microphone recording.");
}

export function base64ToBlob(dataBase64: string, mimeType: string): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function nativeRecordingToBlob(recording: NativeSpeechRecording): Blob {
  if (!recording.dataBase64) {
    throw new Error("Recording did not capture any audio.");
  }
  return base64ToBlob(recording.dataBase64, recording.mimeType || "audio/wav");
}

export function appendTranscriptToInput(input: string, transcript: string) {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return input;
  const cleanInput = input.trimEnd();
  return cleanInput ? `${cleanInput} ${cleanTranscript}` : cleanTranscript;
}

export function useSpeechRecorder({
  onTranscript,
  onError,
}: UseSpeechRecorderParams) {
  const [status, setStatus] = useState<SpeechRecorderStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const isRecordingRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const stopRecordingStats = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    startedAtRef.current = null;
    setElapsedSeconds(0);
    setLevel(0);
  }, []);

  const pollRecordingStats = useCallback(() => {
    if (!isRecordingRef.current) return;

    if (startedAtRef.current !== null) {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
      );
    }

    void invoke<NativeSpeechLevel>("get_speech_recording_level")
      .then((recordingLevel) => {
        if (!isRecordingRef.current) return;
        setLevel(Math.min(1, Math.max(0, recordingLevel.level)));
      })
      .catch(() => undefined);
  }, []);

  const startRecordingStats = useCallback(() => {
    stopRecordingStats();
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setLevel(0);
    pollRecordingStats();
    pollIntervalRef.current = window.setInterval(
      pollRecordingStats,
      RECORDING_STATS_POLL_INTERVAL_MS,
    );
  }, [pollRecordingStats, stopRecordingStats]);

  const transcribe = useCallback(
    async (audio: Blob) => {
      if (audio.size === 0) {
        throw new Error("Recording did not capture any audio.");
      }

      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setStatus("transcribing");
      const result = await transcribeSpeech(audio, abort.signal);
      onTranscript(result.text);
    },
    [onTranscript],
  );

  const start = useCallback(async () => {
    if (status !== "idle") return;

    try {
      await invoke("start_speech_recording");
      isRecordingRef.current = true;
      startRecordingStats();
      setStatus("recording");
    } catch (error) {
      isRecordingRef.current = false;
      stopRecordingStats();
      setStatus("idle");
      onError(normalizeMicrophoneError(error));
    }
  }, [onError, startRecordingStats, status, stopRecordingStats]);

  const stop = useCallback(() => {
    if (status !== "recording") return;

    isRecordingRef.current = false;
    stopRecordingStats();
    setStatus("transcribing");
    void invoke<NativeSpeechRecording>("stop_speech_recording")
      .then((recording) => {
        return transcribe(nativeRecordingToBlob(recording));
      })
      .catch((error) => {
        if (abortRef.current?.signal.aborted) return;
        onError(normalizeMicrophoneError(error));
      })
      .finally(() => {
        if (abortRef.current?.signal.aborted) return;
        abortRef.current = null;
        isRecordingRef.current = false;
        setStatus("idle");
      });
  }, [onError, status, stopRecordingStats, transcribe]);

  const cancel = useCallback(() => {
    if (status !== "recording") return;

    stopRecordingStats();
    isRecordingRef.current = false;
    setStatus("idle");
    void invoke("cancel_speech_recording").catch((error) => {
      onError(normalizeMicrophoneError(error));
    });
  }, [onError, status, stopRecordingStats]);

  const toggle = useCallback(() => {
    if (status === "recording") {
      stop();
      return;
    }
    if (status === "idle") {
      void start();
    }
  }, [start, status, stop]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        stopRecordingStats();
        void invoke("cancel_speech_recording").catch(() => undefined);
      }
    };
  }, [stopRecordingStats]);

  return {
    status,
    elapsedSeconds,
    level,
    isRecording: status === "recording",
    isTranscribing: status === "transcribing",
    start,
    stop,
    cancel,
    toggle,
  };
}
