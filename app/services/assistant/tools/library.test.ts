import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryTaleItem } from "@/lib/tale-library";
import type { AssistantConfirm } from "@/types/assistant.type";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));
const mocks = vi.hoisted(() => ({
  items: [] as LibraryTaleItem[],
  syncActive: false,
  deleteLibraryTaleItem: vi.fn(),
  syncLibraryTaleItem: vi.fn(),
  removeLibraryTaleItemFromCloud: vi.fn(),
  resolveTaleConflict: vi.fn(),
  deleteTaleById: vi.fn(),
  removeScenario: vi.fn(),
  notifySyncChanged: vi.fn(),
  copy: vi.fn(),
  clipboard: "",
}));
vi.mock("@/services/tale-library", () => ({
  currentSyncSession: () => ({ profile: { id: "hosted" } }),
  loadTaleLibrary: async () => ({
    items: mocks.items,
    syncActive: mocks.syncActive,
  }),
  deleteLibraryTaleItem: mocks.deleteLibraryTaleItem,
  syncLibraryTaleItem: mocks.syncLibraryTaleItem,
  removeLibraryTaleItemFromCloud: mocks.removeLibraryTaleItemFromCloud,
  resolveTaleConflict: mocks.resolveTaleConflict,
}));
vi.mock("@/repositories/tale.repository", () => ({
  getTaleHeads: async () => [],
}));
vi.mock("@/services/tale.service", () => ({
  deleteTaleById: mocks.deleteTaleById,
}));
vi.mock("@/services/scenario.service", () => ({
  getScenarioById: async (id: string) =>
    id === "s1" ? { id, name: "Quiet Sea", content: [] } : null,
  removeScenario: mocks.removeScenario,
  serializeScenarioExport: () => "{json}",
  deserializeScenarioExport: (json: string) => ({ name: `from ${json}` }),
}));
vi.mock("@/services/sync-wakeup", () => ({
  notifySyncChanged: mocks.notifySyncChanged,
}));
vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: mocks.copy,
  readTextFromClipboard: async () => mocks.clipboard,
}));
vi.mock("../tale-edits", () => ({
  withTaleWrites: (_signal: unknown, run: () => unknown) => run(),
}));

const { createLibraryTools } = await import("./library");
const { useTaleStore } = await import("@/store/useTaleStore");

const tale = (id: string, name: string, sync?: string): LibraryTaleItem => ({
  source: "local",
  localTale: { id, name } as LibraryTaleItem extends { localTale: infer T }
    ? T
    : never,
  ...(sync
    ? {
        sync: {
          profileId: "hosted",
          remoteTaleId: `r-${id}`,
          metadataRev: "1",
          status: sync as "idle",
          lastErrorCode: null,
        },
      }
    : {}),
});

let pathname = "/";
let answer = true;
const asked: Array<Omit<AssistantConfirm, "answer">> = [];
const ui = {
  navigate: vi.fn(async () => undefined),
  openTale: vi.fn(),
  forgetTale: vi.fn(),
  showSettings: vi.fn(),
  showPanelTab: vi.fn(),
};
const call = (args: Record<string, unknown>) =>
  createLibraryTools({
    getPathname: () => pathname,
    ui,
    confirm: async (request) => {
      asked.push(request);
      return answer;
    },
  })[0].run(args, undefined);

beforeEach(() => {
  vi.clearAllMocks();
  pathname = "/";
  answer = true;
  asked.length = 0;
  mocks.items = [
    tale("t1", "Quiet Sea"),
    tale("t2", "Lantern Market", "conflict"),
  ];
  mocks.syncActive = true;
  mocks.deleteLibraryTaleItem.mockImplementation(
    async (
      item: LibraryTaleItem,
      options: { deleteLocal: (id: string) => Promise<void> },
    ) => {
      if (item.source === "local") await options.deleteLocal(item.localTale.id);
    },
  );
  useTaleStore.setState({ id: "" });
});

describe("library", () => {
  it("deletes tales only after the player says yes", async () => {
    answer = false;
    expect(await call({ action: "delete", kind: "tale", ids: ["t1"] })).toEqual(
      {
        done: false,
        cancelled: true,
      },
    );
    expect(asked).toEqual([{ action: "delete_tales", names: ["Quiet Sea"] }]);
    expect(mocks.deleteLibraryTaleItem).not.toHaveBeenCalled();

    answer = true;
    expect(
      await call({ action: "delete", kind: "tale", ids: ["t1"] }),
    ).toMatchObject({
      deleted: ["Quiet Sea"],
    });
    expect(mocks.deleteTaleById).toHaveBeenCalledWith("t1");
    expect(ui.forgetTale).toHaveBeenCalledWith("t1");
    expect(mocks.notifySyncChanged).toHaveBeenCalled();
  });

  it("leaves the play screen before deleting the open tale", async () => {
    pathname = "/play";
    useTaleStore.setState({ id: "t1" });
    await call({ action: "delete", kind: "tale", ids: ["t1"] });
    expect(ui.navigate).toHaveBeenCalledWith("/tales");
    expect(ui.navigate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteTaleById.mock.invocationCallOrder[0],
    );
  });

  it("refuses unknown ids and too many at once", async () => {
    await expect(
      call({ action: "delete", kind: "tale", ids: ["nope"] }),
    ).rejects.toThrow(/No tale has id nope/);
    await expect(
      call({
        action: "delete",
        kind: "tale",
        ids: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }),
    ).rejects.toThrow(/At most 20/);
  });

  it("needs cloud sync for syncing, and asks before removing from the cloud", async () => {
    mocks.syncActive = false;
    await expect(call({ action: "sync", ids: ["t1"] })).rejects.toThrow(
      /Account & Sync/,
    );
    mocks.syncActive = true;
    mocks.syncLibraryTaleItem.mockResolvedValue(true);
    expect(await call({ action: "sync", ids: ["t1"] })).toMatchObject({
      syncing: ["Quiet Sea"],
    });
    await call({ action: "stop_syncing", ids: ["t1"] });
    expect(asked.at(-1)).toEqual({
      action: "remove_from_cloud",
      names: ["Quiet Sea"],
    });
    expect(mocks.removeLibraryTaleItemFromCloud).toHaveBeenCalled();
  });

  it("keeps both copies of a conflict without asking, and asks before overwriting one", async () => {
    mocks.resolveTaleConflict.mockResolvedValue("t3");
    await call({ action: "resolve_conflict", ids: ["t2"], keep: "both" });
    expect(asked).toEqual([]);
    expect(mocks.resolveTaleConflict).toHaveBeenCalledWith(
      mocks.items[1],
      "keep-both",
      expect.anything(),
    );
    answer = false;
    await call({ action: "resolve_conflict", ids: ["t2"], keep: "cloud" });
    expect(asked).toEqual([
      { action: "keep_cloud", names: ["Lantern Market"] },
    ]);
    expect(mocks.resolveTaleConflict).toHaveBeenCalledTimes(1);
  });

  it("deletes scenarios, copies them and opens copied ones", async () => {
    pathname = "/scenarios/s1";
    await call({ action: "delete", kind: "scenario", ids: ["s1"] });
    expect(asked).toEqual([
      { action: "delete_scenarios", names: ["Quiet Sea"] },
    ]);
    expect(ui.navigate).toHaveBeenCalledWith("/scenarios", {
      search: { tab: "local" },
    });
    expect(mocks.removeScenario).toHaveBeenCalledWith("s1");

    expect(await call({ action: "export", ids: ["s1"] })).toEqual({
      copied: "Quiet Sea",
    });
    expect(mocks.copy).toHaveBeenCalledWith("{json}");

    mocks.clipboard = "clipboard";
    await call({ action: "import" });
    expect(ui.navigate).toHaveBeenLastCalledWith("/scenarios/new", {
      state: { importedScenario: { name: "from clipboard" } },
    });
  });
});
