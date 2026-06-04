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
  const abortRef = useRef<AbortController | null>(null);
  const isRecordingRef = useRef(false);

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
      setStatus("recording");
    } catch (error) {
      isRecordingRef.current = false;
      setStatus("idle");
      onError(normalizeMicrophoneError(error));
    }
  }, [onError, status]);

  const stop = useCallback(() => {
    if (status !== "recording") return;

    setStatus("transcribing");
    void invoke<NativeSpeechRecording>("stop_speech_recording")
      .then((recording) => {
        isRecordingRef.current = false;
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
  }, [onError, status, transcribe]);

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
        void invoke("stop_speech_recording").catch(() => undefined);
      }
    };
  }, []);

  return {
    status,
    isRecording: status === "recording",
    isTranscribing: status === "transcribing",
    start,
    stop,
    toggle,
  };
}
