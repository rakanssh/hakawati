import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameMode,
  PromptComponentType,
  type Scenario,
} from "@/types/context.type";
import type { CatalogScenarioDetail } from "@/types/catalog.type";
import ScenarioDetails from "./details";
import ScenarioCatalogDetails from "./catalog-details";

const mocks = vi.hoisted(() => ({
  routeId: "scenario-1",
  baseUrl: "https://catalog.example/v1",
  navigate: vi.fn(),
  loadTale: vi.fn(),
  getScenario: vi.fn(),
  initTale: vi.fn(),
  view: vi.fn(),
  viewOwned: vi.fn(),
  start: vi.fn(),
  publish: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useLingui: () => ({ t: translate }),
}));

function translate(parts: TemplateStringsArray, ...values: unknown[]) {
  return parts.reduce(
    (text, part, index) => `${text}${part}${values[index] ?? ""}`,
    "",
  );
}

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: mocks.routeId }),
  useLocation: () => ({ search: {} }),
}));
vi.mock("@/components/scenario", () => ({
  ScenarioDetailsLayout: ({
    title,
    actions,
    children,
  }: {
    title: string;
    actions: ReactNode;
    children?: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {actions}
      {children}
    </div>
  ),
  ScenarioBreadcrumb: () => null,
  PublishScenarioDialog: () => null,
}));
vi.mock("@/components/catalog/CatalogTags", () => ({
  CatalogTags: () => null,
}));
vi.mock("@/hooks/useGameSaves", () => ({
  useLoadTale: () => ({ load: mocks.loadTale }),
}));
vi.mock("@/services/scenario.service", () => ({
  getScenarioById: mocks.getScenario,
  getScenarioHeadById: async () => null,
  initTaleFromScenario: mocks.initTale,
}));
vi.mock("@/hooks/useCatalogScenarios", () => ({
  useCatalogClient: () => ({
    enabled: true,
    baseUrl: mocks.baseUrl,
  }),
  useCatalogActions: () => ({
    view: mocks.view,
    viewOwned: mocks.viewOwned,
    start: mocks.start,
    publish: mocks.publish,
  }),
  useScenarioPublishLinks: () => ({ links: [] }),
}));
vi.mock("@/services/new-tale-sync", () => ({
  canSyncNewTales: async () => true,
}));
vi.mock("@/services/sync-wakeup", () => ({
  addSyncChangedListener: () => () => undefined,
}));
vi.mock("@/store", () => ({
  useSettingsStore: (selector: (state: { fontSize: number }) => unknown) =>
    selector({ fontSize: 1 }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

function localScenario(opening = "Hello ${Your name?}."): Scenario {
  return {
    id: "scenario-1",
    name: "A journey",
    initialGameMode: GameMode.STORY_TELLER,
    description: "A journey awaits.",
    content: [
      {
        id: "opening",
        type: "prompt_component",
        version: 1,
        promptType: PromptComponentType.OPENING,
        content: opening,
      },
    ],
  };
}

function catalogScenario(
  version = "version-1",
  opening?: string,
): CatalogScenarioDetail {
  const local = localScenario(opening);
  return {
    id: local.id,
    currentVersionId: version,
    status: "published",
    title: local.name,
    summary: local.description,
    tags: [],
    author: { id: "author", displayName: "Author" },
    thumbnail: null,
    viewCount: 0,
    startCount: 0,
    updatedAt: "2026-09-16T00:00:00Z",
    publishedAt: "2026-09-16T00:00:00Z",
    package: {
      format: "hakawati-scenario-package",
      formatVersion: 1,
      scenario: {
        title: local.name,
        summary: local.description,
        tags: [],
        initialGameMode: local.initialGameMode,
        description: local.description,
        content: local.content,
      },
    },
  };
}

describe("scenario details start setup", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    mocks.routeId = "scenario-1";
    mocks.baseUrl = "https://catalog.example/v1";
    mocks.getScenario.mockResolvedValue(localScenario());
    mocks.view.mockResolvedValue(catalogScenario());
    mocks.initTale.mockResolvedValue("tale-1");
    mocks.start.mockResolvedValue("tale-1");
    mocks.loadTale.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(catalog = false) {
    await act(async () =>
      root.render(catalog ? <ScenarioCatalogDetails /> : <ScenarioDetails />),
    );
  }

  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === text,
    );
    if (!button) throw new Error(`Missing button: ${text}`);
    await act(async () => button.click());
  }

  function fill(value: string) {
    const input = container.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("cancels locally without creating a tale, then starts with the chosen private snapshot", async () => {
    const scenario = localScenario();
    mocks.getScenario.mockResolvedValue(scenario);
    await render();
    expect(container.textContent).toContain("Hello Your name?.");
    expect(container.textContent).not.toContain("${");
    await click("Start Local");
    fill("Unused");
    await click("Cancel");
    expect(mocks.initTale).not.toHaveBeenCalled();
    await click("Start Local");
    expect(container.querySelector("input")?.value).toBe("");
    const original = structuredClone(scenario);
    scenario.name = "Changed elsewhere";
    fill("Mira");
    await click("Start Tale");
    expect(mocks.initTale).toHaveBeenCalledExactlyOnceWith("scenario-1", {
      syncPolicy: "private",
      answers: { "Your name?": "Mira" },
      scenarioSnapshot: original,
    });
    expect(mocks.loadTale).toHaveBeenCalledWith("tale-1");
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/play" });
  });

  it("reloads a changed public version and restarts blank while keeping the private start choice", async () => {
    const original = catalogScenario();
    const latest = catalogScenario("version-2");
    mocks.view.mockResolvedValueOnce(original).mockResolvedValueOnce(latest);
    mocks.start.mockRejectedValueOnce(
      Object.assign(new Error("Changed"), {
        code: "scenario_version_changed",
        status: 409,
      }),
    );
    await render(true);
    await click("Start Local");
    fill("Old answer");
    await click("Start Tale");
    expect(mocks.start).toHaveBeenNthCalledWith(1, "scenario-1", "private", {
      answers: { "Your name?": "Old answer" },
      scenarioSnapshot: original,
      expectedVersionId: "version-1",
    });
    expect(mocks.view).toHaveBeenCalledTimes(2);
    expect(container.querySelector("input")?.value).toBe("");
    expect(container.textContent).toContain("This scenario has changed.");
    expect(mocks.loadTale).not.toHaveBeenCalled();
    fill("New answer");
    await click("Start Tale");
    expect(mocks.start).toHaveBeenNthCalledWith(2, "scenario-1", "private", {
      answers: { "Your name?": "New answer" },
      scenarioSnapshot: latest,
      expectedVersionId: "version-2",
    });
    expect(mocks.loadTale).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "starts immediately without questions (catalog: %s)",
    async (catalog) => {
      mocks.getScenario.mockResolvedValue(localScenario("A quiet morning."));
      mocks.view.mockResolvedValue(
        catalogScenario("version-1", "A quiet morning."),
      );
      await render(catalog);
      await click("Start Tale");
      expect(catalog ? mocks.start : mocks.initTale).toHaveBeenCalledOnce();
      expect(mocks.loadTale).toHaveBeenCalledWith("tale-1");
      expect(container.querySelector("form")).toBeNull();
    },
  );

  it.each(["missing", "failed"])(
    "shows an error when the next local scenario is %s after changing routes",
    async (result) => {
      await render();
      expect(container.textContent).toContain("A journey");
      mocks.routeId = "scenario-2";
      if (result === "missing") mocks.getScenario.mockResolvedValueOnce(null);
      else mocks.getScenario.mockRejectedValueOnce(new Error("Read failed"));

      await render();

      expect(container.textContent).toContain("Failed to load scenario.");
      expect(container.textContent).not.toContain("Loading...");
      expect(container.textContent).not.toContain("A journey");
      await click("Back to scenarios");
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/scenarios" });
      expect(mocks.initTale).not.toHaveBeenCalled();
    },
  );

  it.each(["local ID", "catalog ID", "catalog server"])(
    "discards the questionnaire when the %s changes while details remain mounted",
    async (change) => {
      const catalog = change !== "local ID";
      await render(catalog);
      await click("Start Tale");
      fill("Old answer");
      mocks.getScenario.mockReturnValue(new Promise(() => undefined));
      mocks.view.mockReturnValue(new Promise(() => undefined));
      if (change === "catalog server")
        mocks.baseUrl = "https://other.example/v1";
      else mocks.routeId = "scenario-2";
      await render(catalog);
      expect(container.querySelector("form")).toBeNull();
      expect(container.textContent).not.toContain("A journey");
      expect(mocks.start).not.toHaveBeenCalled();
      expect(mocks.initTale).not.toHaveBeenCalled();
    },
  );
});
