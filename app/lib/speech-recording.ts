export interface NativeSpeechRecording {
  mimeType: string;
  dataBase64: string;
}

/** How the mobile recorder reports failures; desktop rejects with a string. */
interface NativeSpeechRecorderError {
  code: string | null;
  message: string;
}

/** The person refused the microphone permission the mobile recorder asked for. */
export class MicrophonePermissionError extends Error {
  /** True once Android stops asking, so only the device settings can allow it. */
  readonly blocked: boolean;

  constructor(message: string, blocked: boolean) {
    super(message);
    this.name = "MicrophonePermissionError";
    this.blocked = blocked;
  }
}

/** The mobile recorder ended the recording because the app left the screen. */
export class RecordingInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordingInterruptedError";
  }
}

function isNativeSpeechRecorderError(
  error: unknown,
): error is NativeSpeechRecorderError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as NativeSpeechRecorderError).message === "string"
  );
}

export function normalizeMicrophoneError(error: unknown): Error {
  if (typeof error === "string") {
    return new Error(error);
  }
  if (error instanceof Error) return error;
  if (isNativeSpeechRecorderError(error)) {
    switch (error.code) {
      case "microphonePermissionDenied":
        return new MicrophonePermissionError(error.message, false);
      case "microphonePermissionBlocked":
        return new MicrophonePermissionError(error.message, true);
      case "recordingInterrupted":
        return new RecordingInterruptedError(error.message);
      default:
        return new Error(error.message);
    }
  }
  return new Error("Failed to start microphone recording.");
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
