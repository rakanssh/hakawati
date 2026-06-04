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

  src = "";
  currentTime = 0;
  duration = 12;
  ended = false;
  listeners = new Map<string, Set<() => void>>();

  constructor() {
    MockAudio.instances.push(this);
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
});
