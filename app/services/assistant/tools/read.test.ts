import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode, LogEntryRole, LogEntryMode } from "@/types";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const repo = vi.hoisted(() => ({
  getLogCount: vi.fn(),
  getLogEntries: vi.fn(),
  findLogEntryIndex: vi.fn(),
  searchLogEntries: vi.fn(),
  getTalePlayLoad: vi.fn(),
  getTales: vi.fn(),
  getScenario: vi.fn(),
  getScenarios: vi.fn(),
}));
vi.mock("@/repositories/tale.repository", () => repo);
vi.mock("@/repositories/scenario.repository", () => repo);

import { useTaleStore } from "@/store/useTaleStore";
import { createReadTools } from "./read";

function tools(pathname: string) {
  const list = createReadTools({ getPathname: () => pathname });
  return (name: string, args: Record<string, unknown> = {}) =>
    list
      .find((tool) => tool.definition.function.name === name)!
      .run(args, undefined) as Promise<Record<string, unknown>>;
}

const entry = (id: string, text: string) => ({
  id,
  role: LogEntryRole.PLAYER,
  mode: LogEntryMode.DO,
  text,
});

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
  useTaleStore.setState({
    id: "open",
    name: "Live name",
    description: "",
    gameMode: GameMode.GM,
    components: [],
    storyCards: [],
    stats: [{ name: "HP", value: 3, range: [0, 10] }],
    inventory: [],
    totalLogCount: 12,
  });
});

describe("Hakawati read tools", () => {
  it("needs a tale id when no tale is open", async () => {
    await expect(tools("/")("read_log")).rejects.toThrow("No tale is open");
  });

  it("reads the open tale's setup from the play screen's live state", async () => {
    const setup = await tools("/play")("get_tale");
    expect(setup).toMatchObject({
      id: "open",
      open: true,
      name: "Live name",
      mode: "game_master",
      passages: 12,
      stats: [{ name: "HP", value: 3, range: [0, 10] }],
    });
    expect(repo.getTalePlayLoad).not.toHaveBeenCalled();
  });

  it("reads another tale's setup from storage", async () => {
    repo.getTalePlayLoad.mockResolvedValue({
      name: "Stored",
      description: "",
      gameMode: GameMode.STORY_TELLER,
      components: [],
      storyCards: [],
      stats: [],
      inventory: [],
      totalLogCount: 4,
      scenarioId: null,
    });
    const setup = await tools("/play")("get_tale", { taleId: "other" });
    expect(repo.getTalePlayLoad).toHaveBeenCalledWith("other", {
      logLimit: 0,
    });
    expect(setup).toMatchObject({ open: false, name: "Stored", passages: 4 });
    expect(setup).not.toHaveProperty("stats");
  });

  it("reads passages around one, with their place in the story", async () => {
    repo.getLogCount.mockResolvedValue(100);
    repo.findLogEntryIndex.mockResolvedValue(50);
    repo.getLogEntries.mockResolvedValue([
      entry("a", "One"),
      entry("b", "Two"),
    ]);
    const read = await tools("/play")("read_log", { around: "b", count: 4 });
    expect(repo.getLogEntries).toHaveBeenCalledWith("open", 48, 4);
    expect(read.passages).toEqual([
      { id: "a", index: 48, by: "player", mode: "do", text: "One" },
      { id: "b", index: 49, by: "player", mode: "do", text: "Two" },
    ]);
  });

  it("reads the latest passages by default", async () => {
    repo.getLogCount.mockResolvedValue(30);
    repo.getLogEntries.mockResolvedValue([]);
    await tools("/play")("read_log", { count: 500 });
    expect(repo.getLogEntries).toHaveBeenCalledWith("open", 0, 40);
  });

  it("shortens search matches around the words found", async () => {
    const long = `${"x".repeat(300)} Mara ${"y".repeat(300)}`;
    repo.searchLogEntries.mockResolvedValue([
      { index: 7, entry: entry("m", long) },
    ]);
    const found = await tools("/")("search_log", {
      taleId: "t",
      query: "mara",
    });
    const [match] = found.matches as Array<{ text: string; index: number }>;
    expect(match.index).toBe(7);
    expect(match.text).toMatch(/^…x+ Mara y+…$/);
    expect(match.text.length).toBeLessThan(long.length);
  });

  it("filters the library by name", async () => {
    repo.getTales.mockResolvedValue({
      total: 2,
      data: [
        {
          id: "1",
          name: "Pirates",
          description: "",
          logCount: 3,
          updatedAt: 0,
        },
        { id: "2", name: "Noir", description: "", logCount: 1, updatedAt: 0 },
      ],
    });
    const listed = await tools("/")("list_library", {
      kind: "tales",
      query: "pir",
    });
    expect(listed).toMatchObject({ total: 2, tales: [{ id: "1" }] });
  });
});
