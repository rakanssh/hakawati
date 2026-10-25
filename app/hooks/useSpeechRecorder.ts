import { transcribeSpeech } from "@/services/llm";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  nativeRecordingToBlob,
  normalizeMicrophoneError,
  RecordingInterruptedError,
  type NativeSpeechRecording,
} from "@/lib/speech-recording";

export type SpeechRecorderStatus = "idle" | "recording" | "transcribing";

interface UseSpeechRecorderParams {
  onTranscript: (text: string) => void;
  onError: (error: unknown) => void;
}

interface NativeSpeechLevel {
  level: number;
}

const RECORDING_STATS_POLL_INTERVAL_MS = 50;
export const TRANSCRIPTION_TIMEOUT_MS = 2 * 60_000;

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
      .catch((error) => {
        const reason = normalizeMicrophoneError(error);
        if (!isRecordingRef.current) return;
        if (!(reason instanceof RecordingInterruptedError)) return;
        // The recording already ended natively, so there is nothing to stop.
        isRecordingRef.current = false;
        abortRef.current = null;
        stopRecordingStats();
        setStatus("idle");
        onError(reason);
      });
  }, [onError, stopRecordingStats]);

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

  const start = useCallback(async () => {
    // Claim the recording before invoking native code, which may resolve later.
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await invoke("start_speech_recording");
      if (controller.signal.aborted) {
        await invoke("cancel_speech_recording").catch(() => undefined);
        return;
      }
      isRecordingRef.current = true;
      startRecordingStats();
      setStatus("recording");
    } catch (error) {
      if (controller.signal.aborted) return;
      abortRef.current = null;
      isRecordingRef.current = false;
      stopRecordingStats();
      setStatus("idle");
      onError(normalizeMicrophoneError(error));
    }
  }, [onError, startRecordingStats, stopRecordingStats]);

  const abandonTranscription = useCallback((controller: AbortController) => {
    if (abortRef.current !== controller) return false;
    controller.abort();
    abortRef.current = null;
    setStatus("idle");
    return true;
  }, []);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!isRecordingRef.current || !controller) return;

    isRecordingRef.current = false;
    stopRecordingStats();
    setStatus("transcribing");
    const timeout = window.setTimeout(() => {
      if (abandonTranscription(controller)) {
        onError(new Error("Transcription timed out."));
      }
    }, TRANSCRIPTION_TIMEOUT_MS);
    void invoke<NativeSpeechRecording>("stop_speech_recording")
      .then(async (recording) => {
        if (controller.signal.aborted) return;
        const audio = nativeRecordingToBlob(recording);
        const result = await transcribeSpeech(audio, controller.signal);
        if (!controller.signal.aborted) onTranscript(result.text);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        onError(normalizeMicrophoneError(error));
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (abortRef.current !== controller) return;
        abortRef.current = null;
        setStatus("idle");
      });
  }, [abandonTranscription, onError, onTranscript, stopRecordingStats]);

  const cancel = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    if (status === "transcribing") {
      abandonTranscription(controller);
      return;
    }
    if (!isRecordingRef.current) return;

    controller.abort();
    stopRecordingStats();
    isRecordingRef.current = false;
    void invoke("cancel_speech_recording")
      .catch((error) => {
        if (abortRef.current !== controller) return;
        const reason = normalizeMicrophoneError(error);
        // Already ended because the app left the screen, which is what cancel wants.
        if (reason instanceof RecordingInterruptedError) return;
        onError(reason);
      })
      .finally(() => {
        if (abortRef.current !== controller) return;
        abortRef.current = null;
        setStatus("idle");
      });
  }, [abandonTranscription, onError, status, stopRecordingStats]);

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
      abortRef.current = null;
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
