import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSyncNewTales,
  decideAllTaleSyncPreferences,
  decideTaleSyncPreference,
  listUndecidedTales,
  markNewTaleSyncPreference,
} from "./new-tale-sync";

const syncRepoMocks = vi.hoisted(() => ({
  getSyncProfile: vi.fn(),
  listTaleSyncPreferences: vi.fn(),
  listTaleSyncStates: vi.fn(),
  setTaleSyncPreference: vi.fn(),
}));

const taleServiceMocks = vi.hoisted(() => ({
  getAllTales: vi.fn(),
}));

const syncStoreMock = vi.hoisted(() => ({
  getState: vi.fn(),
}));

const syncWakeMocks = vi.hoisted(() => ({
  wakeSyncBackground: vi.fn(),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync-wakeup", () => syncWakeMocks);
vi.mock("@/services/tale.service", () => taleServiceMocks);

vi.mock("@/store/useSyncSettingsStore", () => ({
  useSyncSettingsStore: syncStoreMock,
}));

describe("new tale sync preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncStoreMock.getState.mockReturnValue({
      activeSyncMode: "hosted",
      cloudBaseUrl: "https://sync.example",
      personalBaseUrl: "",
      accessToken: "token",
      accessTokenExpiresAt: null,
      accountDisplayName: "",
      accountEmail: "",
    });
    syncRepoMocks.getSyncProfile.mockResolvedValue({ enabled: true });
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValue([]);
    syncRepoMocks.listTaleSyncStates.mockResolvedValue([]);
    taleServiceMocks.getAllTales.mockResolvedValue({
      data: [],
      page: 1,
      limit: 100,
      total: 0,
    });
  });

  it("marks new tales for sync when the active profile is connected", async () => {
    await markNewTaleSyncPreference("local-1");

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "sync",
    });
    expect(syncWakeMocks.wakeSyncBackground).toHaveBeenCalledOnce();
  });

  it("knows when new tales can sync by default", async () => {
    await expect(canSyncNewTales()).resolves.toBe(true);

    syncRepoMocks.getSyncProfile.mockResolvedValueOnce(null);
    await expect(canSyncNewTales()).resolves.toBe(false);
  });

  it("keeps explicit private tales local-only", async () => {
    await markNewTaleSyncPreference("local-1", "private");

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "private",
    });
    expect(syncWakeMocks.wakeSyncBackground).not.toHaveBeenCalled();
  });

  it("leaves new default tales undecided when sync is disabled on this device", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValueOnce({ enabled: false });

    await markNewTaleSyncPreference("local-1");

    expect(syncRepoMocks.setTaleSyncPreference).not.toHaveBeenCalled();
    expect(syncWakeMocks.wakeSyncBackground).not.toHaveBeenCalled();
  });

  it("leaves new default tales undecided before the active profile is connected", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValueOnce(null);

    await markNewTaleSyncPreference("local-1");

    expect(syncRepoMocks.setTaleSyncPreference).not.toHaveBeenCalled();
    expect(syncWakeMocks.wakeSyncBackground).not.toHaveBeenCalled();
  });

  it("keeps hosted tales sync-intended when only cached account state remains", async () => {
    syncStoreMock.getState.mockReturnValueOnce({
      activeSyncMode: "hosted",
      cloudBaseUrl: "https://sync.example",
      personalBaseUrl: "",
      accessToken: "",
      accessTokenExpiresAt: null,
      accountDisplayName: "",
      accountEmail: "user@example.com",
    });

    await markNewTaleSyncPreference("local-1");

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "sync",
    });
  });

  it("lists only unlinked tales without a preference as undecided", async () => {
    taleServiceMocks.getAllTales.mockResolvedValueOnce({
      data: [
        {
          id: "undecided",
          name: "Undecided",
          description: "No row",
          updatedAt: 30,
          lastLogEntry: null,
        },
        {
          id: "linked",
          name: "Linked",
          description: "",
          updatedAt: 20,
          lastLogEntry: null,
        },
        {
          id: "private",
          name: "Private",
          description: "",
          updatedAt: 10,
          lastLogEntry: null,
        },
        {
          id: "pending-sync",
          name: "Pending",
          description: "",
          updatedAt: 5,
          lastLogEntry: null,
        },
      ],
      page: 1,
      limit: 100,
      total: 4,
    });
    syncRepoMocks.listTaleSyncStates.mockResolvedValueOnce([
      { localTaleId: "linked" },
    ]);
    syncRepoMocks.listTaleSyncPreferences.mockResolvedValueOnce([
      { localTaleId: "private", policy: "private" },
      { localTaleId: "pending-sync", policy: "sync" },
    ]);

    await expect(listUndecidedTales("hosted")).resolves.toEqual([
      {
        id: "undecided",
        name: "Undecided",
        description: "No row",
        updatedAt: 30,
      },
    ]);
  });

  it("decides one tale and wakes sync only for sync choices", async () => {
    await decideTaleSyncPreference("hosted", "local-1", "private");
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "private",
    });
    expect(syncWakeMocks.wakeSyncBackground).not.toHaveBeenCalled();

    await decideTaleSyncPreference("hosted", "local-2", "sync");
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-2",
      policy: "sync",
    });
    expect(syncWakeMocks.wakeSyncBackground).toHaveBeenCalledOnce();
  });

  it("decides all tales and wakes sync for sync choices", async () => {
    await decideAllTaleSyncPreferences(
      "hosted",
      ["local-1", "local-2"],
      "sync",
    );

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledTimes(2);
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "sync",
    });
    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-2",
      policy: "sync",
    });
    expect(syncWakeMocks.wakeSyncBackground).toHaveBeenCalledOnce();
  });
});
