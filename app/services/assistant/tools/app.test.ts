import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, type Scenario } from "@/types/context.type";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
const mocks = vi.hoisted(() => ({
  stored: null as Scenario | null,
  localTale: true,
  importCloudTale: vi.fn(),
  updater: false,
}));
vi.mock("@/i18n", () => ({ loadLocale: vi.fn() }));
vi.mock("@/services/scenario.service", () => ({
  getScenarioById: async () => mocks.stored,
}));
vi.mock("@/services/tale-library.service", () => ({
  currentSyncSession: () => ({}),
  importCloudTale: mocks.importCloudTale,
}));
vi.mock("@/repositories/tale.repository", () => ({
  taleExists: async () => mocks.localTale,
}));
vi.mock("../tale-edits", () => ({
  withTaleWrites: (_signal: unknown, run: () => unknown) => run(),
}));
vi.mock("@/store/useUpdateStore", () => ({
  isUpdaterAvailable: () => mocks.updater,
  useUpdateStore: { getState: () => ({}) },
}));

const { createAppTools } = await import("./app");
const { useScenarioDraftStore } = await import("@/store/useScenarioDraftStore");
const { useTaleStore } = await import("@/store/useTaleStore");
const { useThemeStore } = await import("@/store/useThemeStore");

let pathname = "/";
const recorded: unknown[] = [];
const ui = {
  navigate: vi.fn(async () => undefined),
  openTale: vi.fn(async () => {
    useTaleStore.setState({ id: "t1", name: "Quiet Sea" });
  }),
  forgetTale: vi.fn(),
  showSettings: vi.fn(),
  showPanelTab: vi.fn(),
};
const tools = Object.fromEntries(
  createAppTools({
    getPathname: () => pathname,
    ui,
    recordChanges: (changes) => recorded.push(...changes),
  }).map((tool) => [tool.definition.function.name, tool]),
);
const call = (name: string, args: Record<string, unknown>) =>
  tools[name].run(args, undefined);

const draft: Scenario = {
  id: "s1",
  name: "Quiet Sea",
  description: "",
  initialGameMode: GameMode.STORY_TELLER,
  content: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  pathname = "/";
  recorded.length = 0;
  mocks.stored = null;
  mocks.localTale = true;
  useScenarioDraftStore.setState({ draft: null });
  useThemeStore.setState({ preference: "brass-night" });
});

describe("show", () => {
  it("opens pages, Settings tabs and side-panel tabs", async () => {
    const page = await call("show", { page: "discover", query: "pirates" });
    expect(ui.navigate).toHaveBeenCalledWith("/scenarios", {
      search: { tab: "discover", q: "pirates" },
    });
    expect(page).toHaveProperty("context.page");
    const settings = await call("show", { settings: "generation" });
    expect(settings).not.toHaveProperty("context");
    expect(ui.showSettings).toHaveBeenCalledWith("generation");
    await expect(call("show", { panel: "cards" })).rejects.toThrow(
      /only on the play screen/,
    );
    pathname = "/play";
    await call("show", { panel: "cards" });
    expect(ui.showPanelTab).toHaveBeenCalledWith("cards");
  });

  it("opens a tale, downloading it first when it is only in the cloud", async () => {
    const shown = await call("show", { page: "play", id: "t1" });
    expect(ui.openTale).toHaveBeenCalledWith("t1");
    expect(tools.show.outcome?.(shown)).toBe("Quiet Sea");

    mocks.localTale = false;
    mocks.importCloudTale.mockResolvedValue("t9");
    await call("show", { page: "play", id: "remote-1" });
    expect(ui.openTale).toHaveBeenLastCalledWith("t9");
  });

  it("won't leave the scenario editor with unsaved changes", async () => {
    pathname = "/scenarios/s1/edit";
    mocks.stored = draft;
    useScenarioDraftStore.setState({
      draft: { read: () => ({ ...draft, name: "Changed" }), write: vi.fn() },
    });
    await expect(call("show", { page: "home" })).rejects.toThrow(
      /aren't saved/,
    );
    useScenarioDraftStore.setState({
      draft: { read: () => draft, write: vi.fn() },
    });
    await call("show", { page: "home" });
    expect(ui.navigate).toHaveBeenCalledWith("/", undefined);
  });
});

describe("settings", () => {
  it("lists settings with what they accept", async () => {
    const result = (await call("settings", {
      action: "get",
      keys: ["theme", "fontSize"],
    })) as Record<string, { value: unknown; tab: string }>;
    expect(result.theme).toMatchObject({
      value: "brass-night",
      tab: "appearance",
    });
    expect(Object.keys(result)).toEqual(["theme", "fontSize"]);
  });

  it("changes what it can and says what it couldn't", async () => {
    const result = await call("settings", {
      action: "set",
      values: { theme: "storybook", volume: 3 },
    });
    expect(result).toMatchObject({
      changed: ["theme"],
      notChanged: [expect.stringMatching(/^volume/)],
    });
    expect(recorded).toEqual([
      expect.objectContaining({ kind: "setting", key: "theme" }),
    ]);
    await expect(
      call("settings", { action: "set", values: { theme: "neon" } }),
    ).rejects.toThrow(/theme must be one of/);
  });

  it("says when updates come from an app store", async () => {
    expect(await call("settings", { action: "check_updates" })).toMatchObject({
      note: expect.stringMatching(/app store/),
    });
  });
});
