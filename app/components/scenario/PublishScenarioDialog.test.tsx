import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";
import { GameMode, type Scenario } from "@/types/context.type";
import { PublishScenarioDialog } from "./PublishScenarioDialog";

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
  getLink: vi.fn(),
  getOwned: vi.fn(),
  getPolicies: vi.fn(),
}));
vi.mock("@/repositories/scenario-publish-link.repository", () => ({
  getScenarioPublishLink: mocks.getLink,
}));
vi.mock("@/services/catalog.service", () => ({
  getOwnedCatalogScenario: mocks.getOwned,
  fetchCurrentCatalogPolicies: mocks.getPolicies,
  publishingAcceptanceFor: () => ({
    termsVersion: "1",
    communityGuidelinesVersion: "1",
  }),
}));
vi.mock("@/components/catalog/CatalogTagInput", () => ({
  CatalogTagInput: ({ value }: { value: string[] }) =>
    createElement("output", { "aria-label": "Tags" }, value.join(", ")),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const localScenario: Scenario = {
  id: "local-1",
  name: "Local title",
  description: "Local description",
  initialGameMode: GameMode.STORY_TELLER,
  content: [],
};
const published = {
  title: "Public title",
  summary: "Public summary",
  tags: ["خيال", "science-fiction"],
};
const transport = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
const catalog = {
  authTransport: transport,
  publicTransport: transport,
} as unknown as CatalogClientState;

describe("PublishScenarioDialog metadata", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onPublish = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    mocks.getPolicies.mockResolvedValue({
      policies: [],
      publishingRequires: [],
    });
    mocks.getLink.mockResolvedValue({ catalogScenarioId: "catalog-1" });
    onPublish.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(
    scenario = localScenario,
    updating = true,
    open = true,
  ) {
    await act(async () =>
      root.render(
        createElement(PublishScenarioDialog, {
          open,
          scenario,
          updating,
          thumbnailUploads: false,
          catalog,
          onPublish,
          onOpenChange,
        }),
      ),
    );
  }

  function title() {
    return document.querySelector<HTMLInputElement>("input")!;
  }

  function submit() {
    return document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  it("loads public metadata before allowing an update and preserves it on submit", async () => {
    const request = deferred<typeof published>();
    mocks.getOwned.mockReturnValue(request.promise);
    await render();
    expect(title().disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "Loading published scenario details",
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(),
    );
    expect(submit().disabled).toBe(true);

    await act(async () => request.resolve(published));
    expect(mocks.getLink).toHaveBeenCalledWith("local-1");
    expect(mocks.getOwned).toHaveBeenCalledWith(transport, "catalog-1");
    expect(title().value).toBe(published.title);
    expect(document.querySelector("textarea")?.value).toBe(published.summary);
    expect(document.querySelector("output")?.textContent).toBe(
      "خيال, science-fiction",
    );
    expect(submit().disabled).toBe(false);
    await act(async () => submit().click());
    expect(onPublish).toHaveBeenCalledExactlyOnceWith({
      metadata: published,
      thumbnailFile: null,
      policyAcceptance: { termsVersion: "1", communityGuidelinesVersion: "1" },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses local defaults for a new publication without fetching public metadata", async () => {
    await render(localScenario, false);
    expect(title().value).toBe(localScenario.name);
    expect(title().disabled).toBe(false);
    expect(document.querySelector("textarea")?.value).toBe(
      localScenario.description,
    );
    expect(document.querySelector("output")?.textContent).toBe("");
    expect(mocks.getLink).not.toHaveBeenCalled();
    expect(mocks.getOwned).not.toHaveBeenCalled();
  });

  it("blocks an update when metadata loading fails and supports retry", async () => {
    mocks.getOwned
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce(published);
    await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Published scenario details could not be loaded.",
    );
    expect(submit().disabled).toBe(true);
    const retry = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    )!;
    await act(async () => retry.click());
    expect(title().value).toBe(published.title);
    expect(title().disabled).toBe(false);
  });

  it.each(["scenario changes", "dialog reopens"])(
    "ignores stale metadata when the %s",
    async (change) => {
      const stale = deferred<typeof published>();
      mocks.getOwned
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce({ ...published, title: "Current public title" });
      await render();
      if (change === "dialog reopens") {
        await render(localScenario, true, false);
        await render();
      } else {
        await render({ ...localScenario, id: "local-2" });
      }
      await act(async () => stale.resolve(published));
      expect(title().value).toBe("Current public title");
    },
  );
});
