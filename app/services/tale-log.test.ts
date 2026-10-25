import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogEntryRole, type LogEntry } from "@/types/log.type";

vi.mock("@/repositories/tale.repository", () => ({ getLogEntries: vi.fn() }));
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

import { getLogEntries } from "@/repositories/tale.repository";
import { useTaleStore } from "@/store/useTaleStore";
import { loadOlderLogEntries } from "./tale-log";

describe("loading older log entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaleStore.setState({
      id: "tale",
      stats: [{ name: "HP", value: 95, range: [0, 100] }],
      inventory: [],
      log: [],
      undoStack: [],
      totalLogCount: 0,
      oldestLoadedIndex: 0,
      isLoadingOlderEntries: false,
    });
  });

  it("does not prepend old rows after the visible log window moves", async () => {
    let resolve!: (entries: LogEntry[]) => void;
    vi.mocked(getLogEntries).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    useTaleStore.setState({
      oldestLoadedIndex: 100,
      totalLogCount: 101,
      log: [{ id: "old-window", role: LogEntryRole.GM, text: "Old window" }],
    });
    const loading = loadOlderLogEntries(50);
    const currentWindow: LogEntry[] = [
      { id: "new-window", role: LogEntryRole.GM, text: "New window" },
    ];
    useTaleStore.setState({
      oldestLoadedIndex: 200,
      totalLogCount: 201,
      log: currentWindow,
    });
    resolve([
      {
        id: "stale",
        role: LogEntryRole.GM,
        text: "Outside the current window",
      },
    ]);
    await loading;
    expect(useTaleStore.getState().log).toEqual(currentWindow);
    expect(useTaleStore.getState().oldestLoadedIndex).toBe(200);
    expect(useTaleStore.getState().isLoadingOlderEntries).toBe(false);
  });

  it("does not clear another tale's pending history load when an older request finishes", async () => {
    let finishFirst!: (entries: LogEntry[]) => void;
    let finishSecond!: (entries: LogEntry[]) => void;
    vi.mocked(getLogEntries)
      .mockReturnValueOnce(
        new Promise((done) => {
          finishFirst = done;
        }),
      )
      .mockReturnValueOnce(
        new Promise((done) => {
          finishSecond = done;
        }),
      );
    useTaleStore.setState({ oldestLoadedIndex: 10 });
    const first = loadOlderLogEntries(5);
    useTaleStore.setState({
      id: "second-tale",
      oldestLoadedIndex: 20,
      isLoadingOlderEntries: false,
    });
    const second = loadOlderLogEntries(5);
    finishFirst([]);
    await first;
    expect(useTaleStore.getState().isLoadingOlderEntries).toBe(true);
    const entries: LogEntry[] = [
      { id: "second", role: LogEntryRole.GM, text: "Second tale history" },
    ];
    finishSecond(entries);
    await second;
    expect(useTaleStore.getState().log).toEqual(entries);
    expect(useTaleStore.getState().isLoadingOlderEntries).toBe(false);
  });
});
