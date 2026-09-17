import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogClientState } from "@/hooks/useCatalogScenarios";
import {
  GameMode,
  PromptComponentType,
  type Scenario,
} from "@/types/context.type";
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
  prepareDraft: vi.fn(),
  getPolicies: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
}));
vi.mock("@/services/catalog.service", () => ({
  prepareScenarioPublishDraft: mocks.prepareDraft,
  fetchCurrentCatalogPolicies: mocks.getPolicies,
  publishingAcceptanceFor: () => ({
    termsVersion: "1",
    communityGuidelinesVersion: "1",
  }),
}));
vi.mock("@/components/catalog/CatalogTagInput", () => ({
  CatalogTagInput: ({
    value,
    onChange,
    disabled,
  }: {
    value: string[];
    onChange: (tags: string[]) => void;
    disabled?: boolean;
  }) =>
    createElement(
      "div",
      null,
      createElement("output", { "aria-label": "Tags" }, value.join(", ")),
      createElement(
        "button",
        {
          type: "button",
          disabled,
          onClick: () => onChange([...value, "adventure"]),
        },
        "Add adventure tag",
      ),
    ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function makeScenario(): Scenario {
  return {
    id: "local-1",
    name: "Local title",
    description: "Local description",
    initialGameMode: GameMode.STORY_TELLER,
    thumbnail: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]),
    content: [
      {
        id: "plot-1",
        type: "prompt_component",
        version: 1,
        promptType: PromptComponentType.PLOT,
        content: "The current local story.",
      },
    ],
  };
}

const published = {
  title: "Old public title",
  summary: "Old public summary",
  thumbnail: { assetId: "old-cover" },
  tags: ["خيال", "science-fiction"],
};
const transport = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
const catalog = {
  authTransport: transport,
  publicTransport: transport,
} as unknown as CatalogClientState;
const acceptance = { termsVersion: "1", communityGuidelinesVersion: "1" };

describe("PublishScenarioDialog draft preview", () => {
  let root: Root;
  let container: HTMLDivElement;
  let localScenario: Scenario;
  const onPublish = vi.fn();
  const onOpenChange = vi.fn();
  const onEdit = vi.fn();

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
    mocks.createObjectURL.mockReturnValue("blob:scenario-cover");
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: mocks.createObjectURL },
      revokeObjectURL: { configurable: true, value: mocks.revokeObjectURL },
    });
    mocks.getPolicies.mockResolvedValue({
      policies: [],
      publishingRequires: [],
    });
    mocks.prepareDraft.mockImplementation(async (scenario: Scenario) => ({
      scenario,
      published,
    }));
    onPublish.mockResolvedValue(undefined);
    localScenario = makeScenario();
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
    thumbnailUploads = true,
  ) {
    await act(async () =>
      root.render(
        createElement(PublishScenarioDialog, {
          open,
          scenario,
          updating,
          thumbnailUploads,
          catalog,
          onPublish,
          onOpenChange,
          onEdit,
        }),
      ),
    );
  }

  function button(text: string) {
    const match = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((candidate) => candidate.textContent === text);
    expect(match, `Expected button: ${text}`).toBeDefined();
    return match!;
  }

  function submit() {
    return document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  async function acceptPolicies() {
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(),
    );
  }

  it("previews and publishes local details and cover together while retaining public tags", async () => {
    const request = deferred<{
      scenario: Scenario;
      published: typeof published;
    }>();
    mocks.prepareDraft.mockReturnValue(request.promise);
    await render();
    expect(document.body.textContent).toContain(
      "Loading published scenario details",
    );
    await acceptPolicies();
    expect(submit().disabled).toBe(true);

    await act(async () =>
      request.resolve({ scenario: localScenario, published }),
    );
    expect(mocks.prepareDraft).toHaveBeenCalledExactlyOnceWith(
      structuredClone(localScenario),
      transport,
    );
    expect(document.querySelector("h3")?.textContent).toBe(localScenario.name);
    expect(document.body.textContent).toContain(localScenario.description);
    expect(document.body.textContent).not.toContain(published.title);
    expect(document.body.textContent).not.toContain(published.summary);
    expect(
      document.querySelector<HTMLImageElement>('img[alt="Scenario cover"]')
        ?.src,
    ).toBe("blob:scenario-cover");
    expect(document.querySelector("textarea")).toBeNull();
    expect(
      document.querySelector('input[type="text"], input[type="file"]'),
    ).toBeNull();
    expect(document.querySelector("output")?.textContent).toBe(
      "خيال, science-fiction",
    );
    expect(submit().disabled).toBe(false);

    await act(async () => submit().click());
    expect(onPublish).toHaveBeenCalledExactlyOnceWith({
      scenario: structuredClone(localScenario),
      tags: published.tags,
      policyAcceptance: acceptance,
    });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("uses a snapshot for a new publication and lets the author choose tags", async () => {
    const snapshot = structuredClone(localScenario);
    await render(localScenario, false);
    expect(mocks.prepareDraft).not.toHaveBeenCalled();
    expect(document.querySelector("output")?.textContent).toBe("");
    expect(document.querySelector("h3")?.textContent).toBe(snapshot.name);
    expect(submit().disabled).toBe(true);

    localScenario.name = "A later edit";
    localScenario.content.length = 0;
    localScenario.thumbnail![8] = 99;
    await act(async () => button("Add adventure tag").click());
    await acceptPolicies();
    await act(async () => submit().click());
    expect(onPublish).toHaveBeenCalledExactlyOnceWith({
      scenario: snapshot,
      tags: ["adventure"],
      policyAcceptance: acceptance,
    });
  });

  it("blocks an update when draft preparation fails and supports retry", async () => {
    mocks.prepareDraft
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({ scenario: localScenario, published });
    await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Published scenario details could not be loaded.",
    );
    expect(submit().disabled).toBe(true);
    await act(async () => button("Retry").click());
    await acceptPolicies();
    expect(submit().disabled).toBe(false);
    expect(document.querySelector("h3")?.textContent).toBe(localScenario.name);
  });

  it.each(["scenario changes", "dialog reopens"])(
    "ignores stale draft preparation when the %s",
    async (change) => {
      const stale = deferred<{
        scenario: Scenario;
        published: typeof published;
      }>();
      const currentScenario = {
        ...makeScenario(),
        name: "Current draft title",
      };
      const currentPublished = { ...published, tags: ["current-tag"] };
      mocks.prepareDraft
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce({
          scenario: currentScenario,
          published: currentPublished,
        });
      await render();
      if (change === "dialog reopens") {
        await render(localScenario, true, false);
        await render();
      } else {
        await render({ ...localScenario, id: "local-2" });
      }
      await act(async () =>
        stale.resolve({ scenario: localScenario, published }),
      );
      expect(document.querySelector("h3")?.textContent).toBe(
        "Current draft title",
      );
      expect(document.querySelector("output")?.textContent).toBe("current-tag");
    },
  );

  it.each([
    {
      name: "   ",
      description: "Valid description",
      expected: "Add a scenario name",
    },
    {
      name: "N".repeat(161),
      description: "Valid description",
      expected: "160 characters",
    },
    { name: "Valid name", description: "   ", expected: "Add a description" },
    {
      name: "Valid name",
      description: "D".repeat(601),
      expected: "600 characters",
    },
  ])(
    "blocks invalid public details with an edit action ($expected)",
    async ({ name, description, expected }) => {
      await render({ ...localScenario, name, description }, false);
      await act(async () => button("Add adventure tag").click());
      await acceptPolicies();
      expect(document.querySelector("h3")?.textContent).toBe(name);
      expect(document.body.textContent).toContain(description);
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        expected,
      );
      expect(submit().disabled).toBe(true);
      await act(async () => submit().click());
      expect(onPublish).not.toHaveBeenCalled();
      await act(async () => button("Edit scenario").click());
      expect(onEdit).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the preview open after a failed publish and allows another attempt", async () => {
    onPublish.mockRejectedValueOnce(new Error("Please try again"));
    await render();
    await acceptPolicies();
    await act(async () => submit().click());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Please try again",
    );
    expect(submit().disabled).toBe(false);
    expect(document.querySelector("h3")?.textContent).toBe(localScenario.name);
    await act(async () => submit().click());
    expect(onPublish).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not close a replacement scenario when an earlier publish finishes", async () => {
    const publishing = deferred<void>();
    onPublish.mockReturnValueOnce(publishing.promise);
    await render();
    await acceptPolicies();
    await act(async () => submit().click());
    expect(submit().disabled).toBe(true);
    await render({
      ...makeScenario(),
      id: "local-2",
      name: "Replacement scenario",
    });
    await act(async () => publishing.resolve());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector("h3")?.textContent).toBe(
      "Replacement scenario",
    );
    expect(
      document.querySelector('[role="checkbox"]')?.getAttribute("data-state"),
    ).toBe("unchecked");
  });

  it("blocks publishing a draft cover when cover uploads are unavailable", async () => {
    await render(localScenario, true, true, false);
    await acceptPolicies();
    expect(submit().disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Cover uploads are currently unavailable",
    );
    expect(onPublish).not.toHaveBeenCalled();
  });
});
