import { describe, expect, it } from "vitest";
import {
  appendTranscriptToInput,
  base64ToBlob,
  MicrophonePermissionError,
  nativeRecordingToBlob,
  normalizeMicrophoneError,
} from "./speech-recording";

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
