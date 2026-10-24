import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendTranscriptToInput,
  base64ToBlob,
  MicrophonePermissionError,
  nativeRecordingToBlob,
  normalizeMicrophoneError,
  RecordingInterruptedError,
  TRANSCRIPTION_TIMEOUT_MS,
  useSpeechRecorder,
} from "./useSpeechRecorder";

const { invokeMock, transcribeSpeechMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  transcribeSpeechMock: vi.fn(),
}));

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@/services/llm", () => ({
  transcribeSpeech: transcribeSpeechMock,
}));

function renderRecorderHarness({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (error: unknown) => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: ReturnType<typeof useSpeechRecorder> | undefined;

  function Harness() {
    controls = useSpeechRecorder({ onTranscript, onError });
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });

  return {
    get controls() {
      if (!controls) throw new Error("Harness did not render.");
      return controls;
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

function mockNativeRecorder({
  level = 0.4,
  stopRecording = { mimeType: "audio/wav", dataBase64: "YXVkaW8=" },
}: {
  level?: number;
  stopRecording?: { mimeType: string; dataBase64: string };
} = {}) {
  invokeMock.mockImplementation((command: string) => {
    switch (command) {
      case "start_speech_recording":
      case "cancel_speech_recording":
        return Promise.resolve(undefined);
      case "get_speech_recording_level":
        return Promise.resolve({ level });
      case "stop_speech_recording":
        return Promise.resolve(stopRecording);
      default:
        return Promise.reject(new Error(`Unexpected command: ${command}`));
    }
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  invokeMock.mockReset();
  transcribeSpeechMock.mockReset();
});

describe("appendTranscriptToInput", () => {
  it("uses transcript as input when the current input is empty", () => {
    expect(appendTranscriptToInput("", " open the door ")).toBe(
      "open the door",
    );
  });

  it("appends transcript to existing input with one space", () => {
    expect(appendTranscriptToInput("say hello  ", " then bow ")).toBe(
      "say hello then bow",
    );
  });

  it("leaves input unchanged when transcript is empty", () => {
    expect(appendTranscriptToInput("wait here", "   ")).toBe("wait here");
  });
});

describe("native recording helpers", () => {
  it("converts base64 audio into a typed blob", () => {
    const blob = base64ToBlob("YXVkaW8=", "audio/wav");

    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(5);
  });

  it("rejects empty native recording payloads", () => {
    expect(() =>
      nativeRecordingToBlob({ mimeType: "audio/wav", dataBase64: "" }),
    ).toThrow(/did not capture/);
  });
});

describe("normalizeMicrophoneError", () => {
  it("keeps desktop string errors as their message", () => {
    expect(
      normalizeMicrophoneError("No microphone input device was found."),
    ).toEqual(new Error("No microphone input device was found."));
  });

  it("marks a refused mobile microphone permission", () => {
    const denied = normalizeMicrophoneError({
      code: "microphonePermissionDenied",
      message: "Hakawati needs microphone access to record speech.",
    });
    const blocked = normalizeMicrophoneError({
      code: "microphonePermissionBlocked",
      message: "Microphone access is turned off for Hakawati.",
    });

    expect(denied).toBeInstanceOf(MicrophonePermissionError);
    expect((denied as MicrophonePermissionError).blocked).toBe(false);
    expect(blocked).toBeInstanceOf(MicrophonePermissionError);
    expect((blocked as MicrophonePermissionError).blocked).toBe(true);
  });

  it("keeps the message of other mobile recorder failures", () => {
    const error = normalizeMicrophoneError({
      code: null,
      message: "Recording did not capture any audio.",
    });

    expect(error).not.toBeInstanceOf(MicrophonePermissionError);
    expect(error.message).toBe("Recording did not capture any audio.");
  });
});

describe("useSpeechRecorder", () => {
  it("starts and stops native recording, then emits transcript", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    mockNativeRecorder();
    transcribeSpeechMock.mockResolvedValue({ text: "open sesame" });
    const harness = renderRecorderHarness({ onTranscript, onError });

    await act(async () => {
      await harness.controls.start();
    });
    expect(harness.controls.status).toBe("recording");

    act(() => {
      harness.controls.stop();
    });
    await flushPromises();
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("start_speech_recording");
    expect(invokeMock).toHaveBeenCalledWith("stop_speech_recording");
    expect(transcribeSpeechMock).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.any(AbortSignal),
    );
    expect(onTranscript).toHaveBeenCalledWith("open sesame");
    expect(onError).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("leaves transcript unchanged and reports stop failures", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    invokeMock.mockImplementation((command: string) => {
      if (command === "start_speech_recording") return Promise.resolve();
      if (command === "get_speech_recording_level") {
        return Promise.resolve({ level: 0 });
      }
      if (command === "stop_speech_recording") {
        return Promise.reject("Could not stop microphone recording.");
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const harness = renderRecorderHarness({ onTranscript, onError });

    await act(async () => {
      await harness.controls.start();
    });
    act(() => {
      harness.controls.stop();
    });
    await flushPromises();

    expect(onTranscript).not.toHaveBeenCalled();
    expect(transcribeSpeechMock).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Could not stop microphone recording.",
      }),
    );

    harness.cleanup();
  });

  it("exposes elapsed time and live recording level", async () => {
    vi.useFakeTimers();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    mockNativeRecorder({ level: 0.75 });
    const harness = renderRecorderHarness({ onTranscript, onError });

    await act(async () => {
      await harness.controls.start();
    });
    await flushPromises();

    expect(harness.controls.level).toBe(0.75);

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(harness.controls.elapsedSeconds).toBe(1);

    harness.cleanup();
    vi.useRealTimers();
  });

  it("cancels native recording without transcribing", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    mockNativeRecorder();
    const harness = renderRecorderHarness({ onTranscript, onError });

    await act(async () => {
      await harness.controls.start();
    });
    act(() => {
      harness.controls.cancel();
    });
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith("cancel_speech_recording");
    expect(transcribeSpeechMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("reports a refused microphone permission and stays idle", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    invokeMock.mockImplementation((command: string) => {
      if (command === "start_speech_recording") {
        return Promise.reject({
          code: "microphonePermissionDenied",
          message: "Hakawati needs microphone access to record speech.",
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const harness = renderRecorderHarness({ onTranscript, onError });

    await act(async () => {
      await harness.controls.start();
    });

    expect(harness.controls.status).toBe("idle");
    expect(onError).toHaveBeenCalledWith(expect.any(MicrophonePermissionError));
    expect(invokeMock).not.toHaveBeenCalledWith("get_speech_recording_level");

    harness.cleanup();
  });

  it("returns to idle when the recorder ends because the app left the screen", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    let interrupted = false;
    invokeMock.mockImplementation((command: string) => {
      if (command === "start_speech_recording") return Promise.resolve();
      if (command === "get_speech_recording_level") {
        return interrupted
          ? Promise.reject({
              code: "recordingInterrupted",
              message: "Recording stopped because you left Hakawati.",
            })
          : Promise.resolve({ level: 0.2 });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    vi.useFakeTimers();
    const harness = renderRecorderHarness({ onTranscript, onError });

    await act(async () => {
      await harness.controls.start();
    });
    expect(harness.controls.status).toBe("recording");

    interrupted = true;
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    await flushPromises();

    expect(harness.controls.status).toBe("idle");
    expect(harness.controls.level).toBe(0);
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.any(RecordingInterruptedError),
    );
    expect(invokeMock).not.toHaveBeenCalledWith("stop_speech_recording");
    expect(transcribeSpeechMock).not.toHaveBeenCalled();

    harness.cleanup();
    vi.useRealTimers();
  });

  describe("when transcription stalls", () => {
    async function stopIntoStalledTranscription(
      onTranscript = vi.fn(),
      onError = vi.fn(),
    ) {
      mockNativeRecorder();
      transcribeSpeechMock.mockReturnValue(new Promise(() => undefined));
      const harness = renderRecorderHarness({ onTranscript, onError });
      await act(async () => {
        await harness.controls.start();
      });
      act(() => {
        harness.controls.stop();
      });
      await flushPromises();
      await flushPromises();
      expect(harness.controls.status).toBe("transcribing");
      const [, signal] = transcribeSpeechMock.mock.calls[0] as [
        Blob,
        AbortSignal,
      ];
      return { harness, signal, onTranscript, onError };
    }

    it("can be cancelled, freeing the composer", async () => {
      const { harness, signal, onTranscript, onError } =
        await stopIntoStalledTranscription();

      act(() => {
        harness.controls.cancel();
      });

      expect(harness.controls.status).toBe("idle");
      expect(signal.aborted).toBe(true);
      expect(onTranscript).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      harness.cleanup();
    });

    it("gives up after a while and reports it", async () => {
      vi.useFakeTimers();
      try {
        const { harness, signal, onError } =
          await stopIntoStalledTranscription();

        await act(async () => {
          vi.advanceTimersByTime(TRANSCRIPTION_TIMEOUT_MS);
        });

        expect(harness.controls.status).toBe("idle");
        expect(signal.aborted).toBe(true);
        expect(onError).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ message: "Transcription timed out." }),
        );
        await act(async () => {
          await harness.controls.start();
        });
        expect(harness.controls.status).toBe("recording");
        harness.cleanup();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("does not report an interrupted recording as a cancel failure", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    invokeMock.mockImplementation((command: string) => {
      if (command === "start_speech_recording") return Promise.resolve();
      if (command === "get_speech_recording_level") {
        return Promise.resolve({ level: 0 });
      }
      if (command === "cancel_speech_recording") {
        return Promise.reject({
          code: "recordingInterrupted",
          message: "Recording stopped because you left Hakawati.",
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const harness = renderRecorderHarness({ onTranscript, onError });

    await act(async () => {
      await harness.controls.start();
    });
    act(() => {
      harness.controls.cancel();
    });
    await flushPromises();

    expect(harness.controls.status).toBe("idle");
    expect(onError).not.toHaveBeenCalled();

    harness.cleanup();
  });
});
