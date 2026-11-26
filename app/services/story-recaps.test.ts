import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types/log.type";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const mocks = vi.hoisted(() => ({
  generateRecaps: vi.fn(),
  setLogEntryRecaps: vi.fn(),
  wakeSyncBackground: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/repositories/tale.repository", () => ({
  setLogEntryRecaps: mocks.setLogEntryRecaps,
}));
vi.mock("@/services/open-tale-sync", () => ({ isTaleInPlay: () => true }));
vi.mock("@/services/sync-wakeup", () => ({
  wakeSyncBackground: mocks.wakeSyncBackground,
}));
vi.mock("@/services/llm/recapContext", () => ({
  getRecapBudget: () => ({ historyBudget: 1000, share: 0.3 }),
  storyRecapsEnabled: () => true,
}));
vi.mock("@/store/useSettingsStore", () => ({
  isModelRoleConfigured: () => true,
  useSettingsStore: { getState: () => ({ modelRoles: { utility: {} } }) },
}));
vi.mock("@/services/llm/recapGenerator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/llm/recapGenerator")>()),
  generateRecaps: mocks.generateRecaps,
  recapInputBudget: () => 100_000,
}));

const { countEntryTokens } = await import("@/services/llm/contextAssembly");
const { useTaleStore } = await import("@/store/useTaleStore");
const { usePlayActivityStore } = await import("@/store/usePlayActivityStore");
const {
  cancelStoryRecaps,
  planRecapBatch,
  scheduleStoryRecaps,
  MIN_VERBATIM_PASSAGES,
} = await import("./story-recaps");

function turns(count: number, words = 50): LogEntry[] {
  return Array.from({ length: count }, (_, i): LogEntry[] => [
    {
      id: `p${i}`,
      role: LogEntryRole.PLAYER,
      mode: LogEntryMode.DO,
      text: `I act ${i}.`,
    },
    {
      id: `g${i}`,
      role: LogEntryRole.GM,
      mode: LogEntryMode.STORY,
      text: `Scene ${i}. ${"drums ".repeat(words)}`,
    },
  ]).flat();
}

function withRecaps(log: LogEntry[], ids: string[]): LogEntry[] {
  const set = new Set(ids);
  return log.map((entry) =>
    set.has(entry.id) ? { ...entry, recap: [] } : entry,
  );
}

const plan = (
  log: LogEntry[],
  options: Partial<Parameters<typeof planRecapBatch>[0]> = {},
) =>
  planRecapBatch({
    log,
    oldestLoadedIndex: 0,
    historyBudget: 1000,
    share: 0.3,
    inputBudget: () => 100_000,
    ...options,
  });

const pendingIds = (result: ReturnType<typeof plan>) =>
  result?.pending.map((entry) => entry.id);

describe("planning story recaps", () => {
  it("waits while the story still fits word for word", () => {
    expect(plan(turns(5))).toBeNull();
  });

  it("recaps the oldest passages until half the verbatim room is free", () => {
    const log = turns(20);
    const result = plan(log);

    expect(pendingIds(result)?.[0]).toBe("g0");
    const lastPending = log.findIndex(
      (entry) => entry.id === pendingIds(result)!.at(-1),
    );
    const kept = log
      .slice(lastPending + 1)
      .reduce((sum, entry) => sum + countEntryTokens(entry), 0);
    expect(kept).toBeLessThanOrEqual(0.5 * 1000 * 0.7);
    expect(result?.indexRange).toEqual([0, lastPending]);
  });

  it("keeps the newest passages word for word however small the window", () => {
    const result = plan(turns(20), { historyBudget: 100 });
    const newest = Array.from(
      { length: MIN_VERBATIM_PASSAGES },
      (_, i) => `g${19 - i}`,
    );

    expect(pendingIds(result)?.length).toBeGreaterThan(0);
    for (const id of newest) expect(pendingIds(result)).not.toContain(id);
  });

  it("leaves passages too old to fit any recap room alone", () => {
    const result = plan(turns(60), { share: 0.1 });

    expect(pendingIds(result)).not.toContain("g0");
    expect(pendingIds(result)!.length).toBeLessThan(20);
  });

  it("redoes an edited passage behind the recaps", () => {
    const recapped = Array.from({ length: 16 }, (_, i) => `g${i}`).filter(
      (id) => id !== "g7",
    );
    const result = plan(withRecaps(turns(20), recapped));

    expect(pendingIds(result)).toEqual(["g7"]);
    expect(result?.request.range[0].entry.id).toBe("p7");
  });

  it("waits for a few passages unless one needs redoing or is already dropped", () => {
    const recapped = ["g0", "g1", "g2", "g3"];
    expect(
      plan(withRecaps(turns(10), recapped), { historyBudget: 560 }),
    ).toBeNull();

    const gap = plan(
      withRecaps(
        turns(10),
        recapped.filter((id) => id !== "g1"),
      ),
      { historyBudget: 560 },
    );
    expect(pendingIds(gap)).toEqual(["g1", "g4", "g5"]);

    const dropped = plan(withRecaps(turns(10), recapped), {
      historyBudget: 500,
    });
    expect(pendingIds(dropped)).toEqual(["g4", "g5"]);
  });

  it("fits the batch in the Helper's request", () => {
    const all = pendingIds(plan(turns(20)))!;
    const small = pendingIds(plan(turns(20), { inputBudget: () => 1000 }))!;

    expect(small.length).toBeGreaterThan(0);
    expect(small.length).toBeLessThan(all.length);
    expect(pendingIds(plan(turns(20), { maxPending: 2 }))).toEqual([
      "g0",
      "g1",
    ]);
  });
});

describe("running story recaps", () => {
  beforeEach(() => {
    useTaleStore.setState({
      id: "tale-1",
      log: turns(20),
      oldestLoadedIndex: 0,
      totalLogCount: 40,
    });
    mocks.setLogEntryRecaps.mockImplementation(
      async (_taleId: string, writes: { entryId: string }[]) =>
        writes.map((write) => write.entryId),
    );
  });

  afterEach(() => {
    cancelStoryRecaps();
    usePlayActivityStore.setState({ narrating: 0 });
    vi.clearAllMocks();
  });

  it("writes the recaps and marks the loaded passages", async () => {
    mocks.generateRecaps.mockImplementation(
      async (request: { range: { entry: LogEntry; pending: boolean }[] }) =>
        new Map(
          request.range
            .filter((item) => item.pending)
            .map((item) => [item.entry.id, [`Recap of ${item.entry.id}`]]),
        ),
    );

    scheduleStoryRecaps("tale-1");

    await vi.waitFor(() => expect(mocks.wakeSyncBackground).toHaveBeenCalled());
    const g0 = useTaleStore.getState().log.find((entry) => entry.id === "g0");
    expect(g0?.recap).toEqual(["Recap of g0"]);
    expect(mocks.setLogEntryRecaps.mock.calls[0][2].indexRange[0]).toBe(0);
  });

  it("gives way when the narrator starts", async () => {
    let seen: AbortSignal | undefined;
    mocks.generateRecaps.mockImplementation(
      (_request: unknown, signal: AbortSignal) => {
        seen = signal;
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        );
      },
    );

    scheduleStoryRecaps("tale-1");
    await vi.waitFor(() => expect(seen).toBeDefined());
    usePlayActivityStore.setState({ narrating: 1 });

    expect(seen?.aborted).toBe(true);
    await Promise.resolve();
    expect(mocks.setLogEntryRecaps).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("stops for the session after repeated failures and says so once", async () => {
    mocks.generateRecaps.mockRejectedValue(new Error("Helper is down"));

    for (let run = 1; run <= 3; run += 1) {
      scheduleStoryRecaps("tale-1");
      await vi.waitFor(() =>
        expect(mocks.generateRecaps).toHaveBeenCalledTimes(run),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError.mock.calls[0][0]).toContain("Helper is down");

    scheduleStoryRecaps("tale-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.generateRecaps).toHaveBeenCalledTimes(3);
  });
});
