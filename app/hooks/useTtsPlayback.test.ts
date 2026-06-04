import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTtsSessionCache, useTtsPlayback } from "./useTtsPlayback";

const { synthesizeNarrationMock, getNarrationCacheKeyMock } = vi.hoisted(
  () => ({
    synthesizeNarrationMock: vi.fn(),
    getNarrationCacheKeyMock: vi.fn(),
  }),
);

vi.mock("@/services/llm", () => ({
  synthesizeNarration: synthesizeNarrationMock,
  getNarrationCacheKey: getNarrationCacheKeyMock,
}));

class MockAudio {
  static instances: MockAudio[] = [];
  static clampCurrentTimeToDuration = false;

  src = "";
  duration = 12;
  ended = false;
  listeners = new Map<string, Set<() => void>>();
  private currentTimeValue = 0;

  constructor() {
    MockAudio.instances.push(this);
  }

  get currentTime() {
    return this.currentTimeValue;
  }

  set currentTime(value: number) {
    if (MockAudio.clampCurrentTimeToDuration && this.duration > 0) {
      this.currentTimeValue = Math.min(Math.max(0, value), this.duration);
      return;
    }
    this.currentTimeValue = value;
  }

  play = vi.fn(async () => {
    this.dispatch("play");
  });
  pause = vi.fn(() => {
    this.dispatch("pause");
  });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });

  addEventListener(event: string, callback: () => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback);
    this.listeners.set(event, listeners);
  }

  removeEventListener(event: string, callback: () => void) {
    this.listeners.get(event)?.delete(callback);
  }

  dispatch(event: string) {
    this.listeners.get(event)?.forEach((callback) => callback());
  }
}

function renderPlaybackHarness({
  taleId = "tale-1",
  onError = vi.fn(),
}: {
  taleId?: string;
  onError?: (error: unknown) => void;
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let controls: ReturnType<typeof useTtsPlayback> | undefined;

  function Harness({ currentTaleId }: { currentTaleId: string }) {
    controls = useTtsPlayback({ taleId: currentTaleId, onError });
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness, { currentTaleId: taleId }));
  });

  return {
    get controls() {
      if (!controls) throw new Error("Harness did not render.");
      return controls;
    },
    rerender(nextTaleId: string) {
      act(() => {
        root.render(createElement(Harness, { currentTaleId: nextTaleId }));
      });
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

describe("useTtsPlayback", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    synthesizeNarrationMock.mockReset();
    getNarrationCacheKeyMock.mockReset();
    getNarrationCacheKeyMock.mockImplementation((text: string) => text);
    synthesizeNarrationMock.mockResolvedValue({
      audio: new Blob(["audio"], { type: "audio/mpeg" }),
    });
    MockAudio.instances = [];
    MockAudio.clampCurrentTimeToDuration = false;
    clearTtsSessionCache();
    vi.stubGlobal("Audio", MockAudio);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:tts"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses synthesized audio from the session cache", async () => {
    const harness = renderPlaybackHarness();

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    expect(synthesizeNarrationMock).toHaveBeenCalledTimes(1);
    expect(synthesizeNarrationMock).toHaveBeenCalledWith(
      "The door opens.",
      expect.any(AbortSignal),
    );

    harness.cleanup();
  });

  it("clears cached audio on tale switch", async () => {
    const harness = renderPlaybackHarness();

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    harness.rerender("tale-2");
    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    expect(synthesizeNarrationMock).toHaveBeenCalledTimes(2);

    harness.cleanup();
  });

  it("seeks and stops active playback", async () => {
    const harness = renderPlaybackHarness();

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      harness.controls.seek(6);
    });
    expect(harness.controls.currentTime).toBe(6);

    act(() => {
      harness.controls.stop();
    });

    expect(harness.controls.status).toBe("idle");
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    harness.cleanup();
  });

  it("extends duration when playback passes incorrect audio metadata", async () => {
    const harness = renderPlaybackHarness();
    const audio = MockAudio.instances[0];
    audio.duration = 4;

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      audio.currentTime = 8;
      audio.dispatch("timeupdate");
    });

    expect(harness.controls.currentTime).toBe(8);
    expect(harness.controls.duration).toBe(8);

    harness.cleanup();
  });

  it("uses wall-clock progress when media currentTime is stuck", async () => {
    vi.useFakeTimers();
    const harness = renderPlaybackHarness();
    const audio = MockAudio.instances[0];
    audio.duration = 4;
    audio.currentTime = 4;

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(harness.controls.currentTime).toBeGreaterThanOrEqual(5);
    expect(harness.controls.duration).toBeGreaterThanOrEqual(5);

    harness.cleanup();
    vi.useRealTimers();
  });

  it("keeps learned duration when replaying cached audio", async () => {
    const harness = renderPlaybackHarness();
    const audio = MockAudio.instances[0];
    audio.duration = 4;

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      audio.currentTime = 60;
      audio.dispatch("timeupdate");
    });

    expect(harness.controls.duration).toBe(60);

    act(() => {
      audio.currentTime = 0;
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    expect(synthesizeNarrationMock).toHaveBeenCalledTimes(1);
    expect(harness.controls.currentTime).toBeLessThan(0.5);
    expect(harness.controls.duration).toBe(60);

    harness.cleanup();
  });

  it("seeks cached audio using learned duration instead of bad metadata", async () => {
    const harness = renderPlaybackHarness();
    const audio = MockAudio.instances[0];
    audio.duration = 4;

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      audio.currentTime = 60;
      audio.dispatch("timeupdate");
    });
    act(() => {
      audio.currentTime = 0;
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      harness.controls.seek(30);
    });

    expect(audio.currentTime).toBe(30);
    expect(harness.controls.currentTime).toBe(30);
    expect(harness.controls.duration).toBe(60);

    harness.cleanup();
  });

  it("normalizes synthesized audio so native seeking is not clamped to bad metadata", async () => {
    const decodedDuration = 28;
    const sampleRate = 100;
    const sampleCount = decodedDuration * sampleRate;
    const decodedChannel = new Float32Array(sampleCount);
    const decodeAudioDataMock = vi.fn(async () => ({
      duration: decodedDuration,
      length: sampleCount,
      numberOfChannels: 1,
      sampleRate,
      getChannelData: () => decodedChannel,
    }));
    const closeMock = vi.fn(async () => undefined);
    const AudioContextMock = vi.fn(() => ({
      decodeAudioData: decodeAudioDataMock,
      close: closeMock,
    }));
    vi.stubGlobal("AudioContext", AudioContextMock);
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: AudioContextMock,
    });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: AudioContextMock,
    });

    MockAudio.clampCurrentTimeToDuration = true;
    const harness = renderPlaybackHarness();
    const audio = MockAudio.instances[0];
    audio.duration = 4;

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const normalizedAudio = vi.mocked(URL.createObjectURL).mock.calls[0][0];
    expect(normalizedAudio).toBeInstanceOf(Blob);
    expect((normalizedAudio as Blob).type).toBe("audio/wav");
    expect(harness.controls.duration).toBe(decodedDuration);

    audio.duration = decodedDuration;
    act(() => {
      harness.controls.seek(20);
    });

    expect(audio.currentTime).toBe(20);
    expect(harness.controls.currentTime).toBe(20);
    expect(decodeAudioDataMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);

    harness.cleanup();
  });

  it("restarts wall-clock progress from a backward seek target", async () => {
    vi.useFakeTimers();
    const harness = renderPlaybackHarness();
    const audio = MockAudio.instances[0];
    audio.duration = 4;
    audio.currentTime = 4;

    act(() => {
      harness.controls.playNow({ id: "story-1", text: "The door opens." });
    });
    await flushPromises();
    await flushPromises();

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(harness.controls.currentTime).toBeGreaterThanOrEqual(60);

    act(() => {
      harness.controls.seek(10);
    });
    expect(harness.controls.currentTime).toBe(10);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(harness.controls.currentTime).toBeGreaterThanOrEqual(11);
    expect(harness.controls.currentTime).toBeLessThan(20);

    harness.cleanup();
    vi.useRealTimers();
  });
});
