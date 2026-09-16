import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GeneratedQuickstartTale,
  QuickstartTaleAnswers,
} from "@/services/llm/quickstartTaleGenerator";
import { GameMode } from "@/types";
import { QuickstartPage } from "./quickstart-wizard";

i18n.load("en", {});
i18n.activate("en");

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  generate:
    vi.fn<
      (
        answers: QuickstartTaleAnswers,
        signal?: AbortSignal,
      ) => Promise<GeneratedQuickstartTale>
    >(),
  initTale: vi.fn<() => Promise<string>>(),
  canSyncNewTales: vi.fn<() => Promise<boolean>>(),
  markSyncPreference: vi.fn<() => Promise<void>>(),
  resetAllState: vi.fn(),
  setLastPlayedTaleId: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/services/llm/quickstartTaleGenerator", () => ({
  generateQuickstartTale: mocks.generate,
}));
vi.mock("@/services/tale.service", () => ({ initTale: mocks.initTale }));
vi.mock("@/services/new-tale-sync", () => ({
  canSyncNewTales: mocks.canSyncNewTales,
  markNewTaleSyncPreference: mocks.markSyncPreference,
}));
vi.mock("@/store/useTaleStore", () => ({
  useTaleStore: () => ({ resetAllState: mocks.resetAllState }),
}));
vi.mock("@/store/useLastPlayedStore", () => ({
  useLastPlayedStore: () => ({
    setLastPlayedTaleId: mocks.setLastPlayedTaleId,
  }),
}));
vi.mock("@/store/useSettingsStore", () => ({
  isModelRoleConfigured: () => true,
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ modelRoles: { utility: {} } }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("./steps", () => ({ GameModeStep: () => null }));
vi.mock("@/data/quickstart-presets", () => ({
  QUICKSTART_WORLD_OPTIONS: [],
  QUICKSTART_ARCHETYPE_OPTIONS: {},
  QUICKSTART_TONE_OPTIONS: [],
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const answers: QuickstartTaleAnswers = {
  gameMode: GameMode.STORY_TELLER,
  world: "A floating city",
  archetype: "An archivist",
  characterName: "Mira",
  tone: "Hopeful",
  extraDetails: "The library is missing a book.",
};

const generatedTale: GeneratedQuickstartTale = {
  name: "The Missing Book",
  description: "An archivist searches a floating city.",
  plot: "Find the missing book.",
  authorNote: "Keep the tone hopeful.",
  openingText: "The library door opens.",
  storyCards: [],
  stats: [],
  inventory: [],
};

describe("Quickstart generation waiting screen", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    vi.useFakeTimers();
    mocks.canSyncNewTales.mockResolvedValue(true);
    mocks.initTale.mockResolvedValue("tale-1");
    mocks.markSyncPreference.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(I18nProvider, { i18n }, createElement(QuickstartPage)),
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function button(label: string) {
    const match = [...container.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === label,
    );
    if (!match) throw new Error(`Button "${label}" was not rendered`);
    return match;
  }

  function click(label: string) {
    act(() => button(label).click());
  }

  function fill(id: string, value: string) {
    const element = container.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(`#${id}`);
    if (!element) throw new Error(`Input "${id}" was not rendered`);
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    act(() => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        element,
        value,
      );
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function completeSetup() {
    click("Next");
    fill("quickstart-world", answers.world);
    click("Next");
    fill("quickstart-archetype", answers.archetype);
    click("Next");
    fill("character-name", answers.characterName);
    click("Next");
    fill("quickstart-tone", answers.tone!);
    click("Next");
    fill("quickstart-extra-details", answers.extraDetails!);
  }

  function expectNoTaleCreated() {
    expect(mocks.initTale).not.toHaveBeenCalled();
    expect(mocks.markSyncPreference).not.toHaveBeenCalled();
    expect(mocks.resetAllState).not.toHaveBeenCalled();
    expect(mocks.setLastPlayedTaleId).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  }

  it("shows elapsed time and restores the completed setup on cancel", () => {
    mocks.generate.mockReturnValue(deferred<GeneratedQuickstartTale>().promise);
    completeSetup();
    click("Generate Tale");
    const firstSignal = mocks.generate.mock.calls[0][1]!;

    expect(container.querySelector("h1")?.textContent).toBe(
      "Creating your tale…",
    );
    expect(container.querySelector("footer")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("0s");
    act(() => vi.advanceTimersByTime(24_000));
    expect(container.textContent).toContain("24s");

    click("Cancel");

    expect(firstSignal.aborted).toBe(true);
    expect(container.querySelector("h1")?.textContent).toBe(
      "Anything else before the tale begins?",
    );
    expect(container.querySelector("textarea")?.value).toBe(
      answers.extraDetails,
    );
    expect(button("Generate Tale").disabled).toBe(false);
    expect(document.activeElement).toBe(button("Generate Tale"));
    expectNoTaleCreated();

    click("Generate Tale");

    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0]).toEqual(answers);
    expect(mocks.generate.mock.calls[1][1]).not.toBe(firstSignal);
    expect(container.textContent).toContain("0s");
    expect(container.textContent).not.toContain("24s");
  });

  it.each(["resolve", "reject"] as const)(
    "ignores a cancelled request that later %ss while a newer request is waiting",
    async (outcome) => {
      const oldRequest = deferred<GeneratedQuickstartTale>();
      const newRequest = deferred<GeneratedQuickstartTale>();
      mocks.generate
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(newRequest.promise);
      completeSetup();
      click("Generate Tale");
      click("Cancel");
      click("Generate Tale");
      const currentSignal = mocks.generate.mock.calls[1][1]!;

      await act(async () => {
        if (outcome === "resolve") oldRequest.resolve(generatedTale);
        else oldRequest.reject(new Error("Late network failure"));
      });

      expectNoTaleCreated();
      expect(container.querySelector("h1")?.textContent).toBe(
        "Creating your tale…",
      );
      expect(currentSignal.aborted).toBe(false);
      expect(button("Cancel").disabled).toBe(false);
      act(() => vi.advanceTimersByTime(2_000));
      expect(container.textContent).toContain("2s");

      click("Cancel");

      expect(currentSignal.aborted).toBe(true);
      expect(button("Generate Tale").disabled).toBe(false);
      expectNoTaleCreated();
    },
  );

  it("restores the answers and reports an active generation failure before retrying", async () => {
    const request = deferred<GeneratedQuickstartTale>();
    const retry = deferred<GeneratedQuickstartTale>();
    mocks.generate
      .mockReturnValueOnce(request.promise)
      .mockReturnValueOnce(retry.promise);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    completeSetup();
    click("Generate Tale");

    await act(async () => request.reject(new Error("Service unavailable")));

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      "Failed to generate tale: Service unavailable",
    );
    expect(container.querySelector("h1")?.textContent).toBe(
      "Anything else before the tale begins?",
    );
    expect(container.querySelector("textarea")?.value).toBe(
      answers.extraDetails,
    );
    expect(button("Generate Tale").disabled).toBe(false);
    expect(document.activeElement).toBe(button("Generate Tale"));
    expect(mocks.initTale).not.toHaveBeenCalled();
    expect(mocks.markSyncPreference).not.toHaveBeenCalled();
    expect(mocks.resetAllState).not.toHaveBeenCalled();
    expect(mocks.setLastPlayedTaleId).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    click("Generate Tale");

    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0]).toEqual(answers);
    expect(container.querySelector("h1")?.textContent).toBe(
      "Creating your tale…",
    );
  });

  it("disables cancellation while saving and navigates only after persistence finishes", async () => {
    const generation = deferred<GeneratedQuickstartTale>();
    const saving = deferred<string>();
    const syncPreference = deferred<void>();
    mocks.generate.mockReturnValue(generation.promise);
    mocks.initTale.mockReturnValue(saving.promise);
    mocks.markSyncPreference.mockReturnValue(syncPreference.promise);
    completeSetup();
    const localOnly =
      container.querySelector<HTMLButtonElement>('[role="checkbox"]')!;
    act(() => localOnly.click());
    click("Generate Tale");
    const signal = mocks.generate.mock.calls[0][1]!;

    await act(async () => generation.resolve(generatedTale));

    expect(container.querySelector("h1")?.textContent).toBe(
      "Saving your tale…",
    );
    expect(button("Cancel").disabled).toBe(true);
    click("Cancel");
    expect(signal.aborted).toBe(false);
    expect(mocks.initTale).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: generatedTale.name,
        description: generatedTale.description,
        gameMode: answers.gameMode,
        log: [expect.objectContaining({ text: generatedTale.openingText })],
      }),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.markSyncPreference).not.toHaveBeenCalled();

    await act(async () => saving.resolve("tale-1"));

    expect(mocks.markSyncPreference).toHaveBeenCalledExactlyOnceWith(
      "tale-1",
      "private",
    );
    expect(button("Cancel").disabled).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();

    await act(async () => syncPreference.resolve());

    expect(mocks.resetAllState).toHaveBeenCalledOnce();
    expect(mocks.setLastPlayedTaleId).toHaveBeenCalledExactlyOnceWith("tale-1");
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/play" });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "aborts on unmount and ignores a request that later %ss",
    async (outcome) => {
      const request = deferred<GeneratedQuickstartTale>();
      mocks.generate.mockReturnValue(request.promise);
      completeSetup();
      click("Generate Tale");
      const signal = mocks.generate.mock.calls[0][1]!;

      act(() => root.unmount());

      expect(signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === "resolve") request.resolve(generatedTale);
        else request.reject(new Error("Late network failure"));
      });
      expectNoTaleCreated();
    },
  );
});
