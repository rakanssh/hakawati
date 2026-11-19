import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScenarioDraftStore } from "@/store/useScenarioDraftStore";
import { useTaleStore } from "@/store/useTaleStore";
import {
  GameMode,
  PromptComponentType,
  type Scenario,
} from "@/types/context.type";
import type { AssistantChange, ScenarioChange } from "@/types/assistant.type";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const { library, links, initTaleFromScenario, saveAsScenario } = vi.hoisted(
  () => ({
    library: new Map<string, Scenario>(),
    links: new Set<string>(),
    initTaleFromScenario: vi.fn(),
    saveAsScenario: vi.fn(),
  }),
);

vi.mock("@/services/scenario.service", () => ({
  getScenarioById: async (id: string) =>
    library.has(id) ? structuredClone(library.get(id)!) : null,
  saveScenario: async (scenario: Scenario, id?: string) => {
    const savedId = id ?? `s${library.size + 1}`;
    library.set(savedId, structuredClone({ ...scenario, id: savedId }));
    return savedId;
  },
  removeScenario: async (id: string) => {
    library.delete(id);
  },
  initTaleFromScenario,
}));
vi.mock("@/services/tale.service", () => ({ saveAsScenario }));
vi.mock("@/services/new-tale-sync", () => ({
  canSyncNewTales: async () => true,
  markNewTaleSyncPreference: async () => undefined,
}));
vi.mock("@/repositories/scenario-publish-link.repository", () => ({
  getScenarioPublishLink: async (id: string) => (links.has(id) ? { id } : null),
}));
vi.mock("@/repositories/scenario.repository", () => ({}));
vi.mock("@/repositories/tale.repository", () => ({}));
vi.mock("../tale-edits", () => ({
  withTaleWrites: (_signal: unknown, run: () => unknown) => run(),
}));

const { createScenarioTools } = await import("./scenario");
const { revertScenarioChanges } = await import("../scenario-edits");

const sea: Scenario = {
  id: "sea",
  name: "Quiet Sea",
  description: "",
  initialGameMode: GameMode.STORY_TELLER,
  content: [
    {
      type: "prompt_component",
      version: 1,
      id: "p1",
      promptType: PromptComponentType.PLOT,
      content: "A ship returns.",
    },
  ],
  thumbnail: null,
};

let recorded: AssistantChange[];
const openTale = vi.fn(async (taleId: string) => {
  useTaleStore.setState({ id: taleId, name: "The Meridian" });
});

function tools() {
  const list = createScenarioTools({
    getPathname: () => "/",
    ui: {
      openTale,
      navigate: async () => undefined,
      forgetTale: () => undefined,
      showSettings: () => undefined,
      showPanelTab: () => undefined,
    },
    recordChanges: (changes) => recorded.push(...changes),
  });
  return Object.fromEntries(
    list.map((tool) => [tool.definition.function.name, tool]),
  );
}

const call = (name: string, args: Record<string, unknown>) =>
  tools()[name].run(args, undefined);

function openEditor(scenario: Scenario) {
  let form = structuredClone(scenario);
  useScenarioDraftStore.setState({
    draft: {
      read: () => form,
      write: (next) => {
        form = next;
      },
    },
  });
  return () => form;
}

beforeEach(() => {
  library.clear();
  links.clear();
  library.set("sea", structuredClone(sea));
  recorded = [];
  openTale.mockClear();
  initTaleFromScenario.mockReset();
  saveAsScenario.mockReset();
  useScenarioDraftStore.setState({ draft: null, libraryRevision: 0 });
});

describe("edit_scenario", () => {
  it("fills in the form open in the editor and leaves the library alone", async () => {
    const form = openEditor(sea);
    const result = await call("edit_scenario", {
      plot: "A ship never left.",
      cards: [{ op: "add", title: "Mara", content: "The keeper." }],
    });

    expect(result).toMatchObject({ changed: true, inEditor: true });
    expect(form().content).toContainEqual(
      expect.objectContaining({ title: "Mara" }),
    );
    expect(library.get("sea")!.content).toEqual(sea.content);
    expect(recorded).toEqual([
      expect.objectContaining({ kind: "scenario", target: "draft" }),
    ]);
  });

  it("saves a scenario in the library, and creates new ones", async () => {
    await call("edit_scenario", { scenario: "sea", name: "Signal" });
    expect(library.get("sea")!.name).toBe("Signal");
    expect(useScenarioDraftStore.getState().libraryRevision).toBe(1);

    const created = await call("edit_scenario", {
      scenario: "new",
      name: "Lantern Market",
      mode: "game_master",
      stats: [{ op: "set", name: "Coins", value: 3 }],
    });
    const id = (created as { scenarioId: string }).scenarioId;
    expect(library.get(id)).toMatchObject({
      name: "Lantern Market",
      initialGameMode: GameMode.GM,
    });
    expect(recorded.at(-1)).toMatchObject({ before: null });
  });

  it("asks for a scenario when no editor is open", async () => {
    await expect(call("edit_scenario", { name: "x" })).rejects.toThrow(
      /No scenario is open/,
    );
    await expect(
      call("edit_scenario", { scenario: "new", plot: "x" }),
    ).rejects.toThrow(/needs a name/);
  });
});

describe("undoing scenario changes", () => {
  it("puts a library scenario back, and removes one it created", async () => {
    await call("edit_scenario", { scenario: "sea", name: "Signal" });
    await call("edit_scenario", { scenario: "new", name: "Lantern" });
    const { changes, kept } = await revertScenarioChanges(
      recorded as ScenarioChange[],
    );
    expect(kept).toBe(0);
    expect(changes.every((change) => change.undone)).toBe(true);
    expect(library.get("sea")!.name).toBe("Quiet Sea");
    expect([...library.keys()]).toEqual(["sea"]);
  });

  it("keeps a created scenario that was published since", async () => {
    await call("edit_scenario", { scenario: "new", name: "Lantern" });
    const id = (recorded[0] as ScenarioChange).scenarioId;
    links.add(id);
    const { kept } = await revertScenarioChanges(recorded as ScenarioChange[]);
    expect(kept).toBe(1);
    expect(library.has(id)).toBe(true);
  });

  it("undoes form edits while the editor is still open", async () => {
    const form = openEditor(sea);
    await call("edit_scenario", { name: "Signal", plot: "" });
    const { changes } = await revertScenarioChanges(
      recorded as ScenarioChange[],
    );
    expect(changes[0].undone).toBe(true);
    expect(form()).toMatchObject({ name: "Quiet Sea", content: sea.content });

    useScenarioDraftStore.setState({ draft: null });
    await call("edit_scenario", { scenario: "sea", plot: "" });
    openEditor(sea);
    await call("edit_scenario", { name: "Signal" });
    useScenarioDraftStore.setState({ draft: null });
    const later = await revertScenarioChanges(
      recorded.slice(1) as ScenarioChange[],
    );
    expect(later.kept).toBe(1);
  });
});

describe("start_tale", () => {
  it("returns the scenario's questions before starting it", async () => {
    library.set("market", {
      ...sea,
      id: "market",
      content: [
        {
          type: "prompt_component",
          version: 1,
          id: "p1",
          promptType: PromptComponentType.OPENING,
          content: "You are ${Name}, selling ${Ware | choices: tea, maps}.",
        },
      ],
    });
    initTaleFromScenario.mockResolvedValue("tale-1");

    const asked = await call("start_tale", { scenarioId: "market" });
    expect(asked).toMatchObject({
      started: false,
      questions: [
        { question: "Name" },
        { question: "Ware", options: ["tea", "maps"], onlyThese: true },
      ],
    });
    expect(initTaleFromScenario).not.toHaveBeenCalled();

    const ids = (asked as { questions: Array<{ id: string }> }).questions.map(
      (q) => q.id,
    );
    const started = await call("start_tale", {
      scenarioId: "market",
      answers: { [ids[0]]: "Mara", [ids[1]]: "maps" },
    });
    expect(initTaleFromScenario).toHaveBeenCalledWith("market", {
      answers: { [ids[0]]: "Mara", [ids[1]]: "maps" },
    });
    expect(openTale).toHaveBeenCalledWith("tale-1");
    expect(started).toEqual({
      started: true,
      taleId: "tale-1",
      name: "The Meridian",
    });
    expect(tools().start_tale.outcome?.(started)).toBe("The Meridian");
    expect(tools().start_tale.outcome?.(asked)).toBeUndefined();
  });

  it("starts a tale that stays on this device", async () => {
    initTaleFromScenario.mockResolvedValue("tale-2");
    const result = await call("start_tale", {
      scenarioId: "sea",
      private: true,
    });
    expect(initTaleFromScenario).toHaveBeenCalledWith("sea", {
      answers: {},
      syncPolicy: "private",
    });
    expect(openTale).toHaveBeenCalledWith("tale-2");
    expect(result).toMatchObject({ started: true, name: "The Meridian" });
  });

  it("saves a tale as a scenario", async () => {
    saveAsScenario.mockImplementation(async () => {
      library.set("from-tale", { ...sea, id: "from-tale", name: "Kept" });
      return "from-tale";
    });
    const result = await call("scenario_from_tale", { taleId: "t1" });
    expect(saveAsScenario).toHaveBeenCalledWith("t1");
    expect(result).toEqual({ scenarioId: "from-tale", name: "Kept" });
    expect(recorded).toEqual([
      expect.objectContaining({ scenarioId: "from-tale", before: null }),
    ]);
  });
});
