import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
  type Scenario,
} from "@/types/context.type";

type SqlParam = string | number | Uint8Array | null;
const state = vi.hoisted(() => ({
  raw: null as import("node:sqlite").DatabaseSync | null,
  clipboard: "",
}));
const adapter = {
  path: "sqlite:test",
  execute: async (sql: string, params: SqlParam[] = []) => ({
    rowsAffected: Number(state.raw!.prepare(sql).run(...params).changes),
  }),
  select: async <T>(sql: string, params: SqlParam[] = []) =>
    state.raw!.prepare(sql).all(...params) as T,
};

vi.mock("@/services/db", () => ({ getDb: async () => adapter }));
vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: async (text: string) => {
    state.clipboard = text;
  },
  readTextFromClipboard: async () => state.clipboard,
}));
vi.mock("@/hooks/useGameSaves", () => ({
  useLoadTale: () => ({ load: vi.fn() }),
}));
vi.mock("@/services/tale.service", () => ({ initTale: vi.fn() }));
vi.mock("@/services/new-tale-sync", () => ({
  markNewTaleSyncPreference: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useScenarioEditor,
  useScenariosExport,
  useScenariosImport,
} from "./useScenarios";
import { getScenarioById, saveScenario } from "@/services/scenario.service";

const cleanups: (() => void)[] = [];

function renderHook<T>(useHook: () => T) {
  let current!: T;
  const root = createRoot(document.createElement("div"));
  function Harness() {
    current = useHook();
    return null;
  }
  act(() => root.render(createElement(Harness)));
  cleanups.push(() => act(() => root.unmount()));
  return {
    get current() {
      return current;
    },
  };
}

function scenario(): Scenario {
  return {
    id: "",
    name: "Iron Gate",
    initialGameMode: GameMode.GM,
    description: "A gate waits.",
    content: [
      {
        type: "prompt_component",
        version: 1,
        id: "plot",
        promptType: PromptComponentType.PLOT,
        content: "The gate is old.",
      },
      {
        type: "story_card",
        version: 1,
        id: "card",
        title: "Gatekeeper",
        content: "She never sleeps.",
        triggers: ["gatekeeper"],
        category: StorybookCategory.CHARACTER,
        isPinned: false,
      },
    ],
    thumbnail: null,
  };
}

function scenarioIds() {
  return (
    state.raw!.prepare("SELECT id FROM scenarios ORDER BY id").all() as Array<{
      id: string;
    }>
  ).map((row) => row.id);
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  state.raw = new DatabaseSync(":memory:");
  const migrations = join(process.cwd(), "src-tauri", "migrations");
  for (const file of readdirSync(migrations).sort()) {
    state.raw.exec(readFileSync(join(migrations, file), "utf8"));
  }
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  state.raw?.close();
  state.raw = null;
});

describe("scenario import", () => {
  it("saves an imported copy as a new scenario and leaves the original alone", async () => {
    const originalId = await saveScenario(scenario());
    const original = await getScenarioById(originalId);

    const clipboard = renderHook(() => ({
      ...useScenariosExport(),
      ...useScenariosImport(),
    }));
    await clipboard.current.exportById(originalId);
    const imported = await clipboard.current.importFromClipboard();
    const editor = renderHook(() => useScenarioEditor(imported));
    act(() =>
      editor.current.setScenario((current) => ({
        ...current,
        name: "Iron Gate copy",
      })),
    );
    let copyId = "";
    await act(async () => {
      copyId = await editor.current.save();
    });

    expect(copyId).not.toBe(originalId);
    expect(editor.current.scenario.id).toBe(copyId);
    expect(scenarioIds()).toEqual([originalId, copyId].sort());
    expect(await getScenarioById(originalId)).toEqual(original);
    expect(await getScenarioById(copyId)).toEqual({
      ...original,
      id: copyId,
      name: "Iron Gate copy",
    });

    act(() =>
      editor.current.setScenario((current) => ({
        ...current,
        description: "A second gate waits.",
      })),
    );
    await act(async () => {
      await expect(editor.current.save()).resolves.toBe(copyId);
    });
    expect(scenarioIds()).toEqual([originalId, copyId].sort());
    expect(await getScenarioById(originalId)).toEqual(original);
    expect((await getScenarioById(copyId))?.description).toBe(
      "A second gate waits.",
    );
  });
});
