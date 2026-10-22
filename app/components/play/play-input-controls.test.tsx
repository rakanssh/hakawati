import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogEntryMode } from "@/types/log.type";
import type { useSpeechRecorder } from "@/hooks/useSpeechRecorder";
import { PlayInputControls } from "./play-input-controls";

const speech = vi.hoisted(() => ({ cancel: vi.fn() }));

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (value: TemplateStringsArray | { message?: string } | string) =>
      typeof value === "string"
        ? value
        : Array.isArray(value)
          ? value.join("")
          : ((value as { message?: string }).message ?? ""),
  }),
}));

vi.mock("@/hooks/useSpeechRecorder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useSpeechRecorder")>()),
  useSpeechRecorder: (): ReturnType<typeof useSpeechRecorder> => ({
    status: "transcribing",
    elapsedSeconds: 0,
    level: 0,
    isRecording: false,
    isTranscribing: true,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: speech.cancel,
    toggle: vi.fn(),
  }),
}));

describe("PlayInputControls while transcribing", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    speech.cancel.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <PlayInputControls
          action={{ type: LogEntryMode.DO, isRolling: false }}
          setAction={vi.fn()}
          input=""
          setInput={vi.fn()}
          onSubmit={vi.fn()}
          loading={false}
          saving={false}
          onContinue={vi.fn()}
          onRetry={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers a way out of a transcription that is taking too long", () => {
    const cancel = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Cancel transcription"]',
    );
    expect(cancel).not.toBeNull();

    act(() => cancel!.click());
    expect(speech.cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels the transcription with Escape", () => {
    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(speech.cancel).toHaveBeenCalledTimes(1);
  });
});
