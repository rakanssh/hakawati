import { beforeEach, describe, expect, it, vi } from "vitest";
import { markNewTaleSyncPreference } from "./new-tale-sync";

const syncRepoMocks = vi.hoisted(() => ({
  getSyncProfile: vi.fn(),
  setTaleSyncPreference: vi.fn(),
}));

const syncStoreMock = vi.hoisted(() => ({
  getState: vi.fn(),
}));

const syncWakeMocks = vi.hoisted(() => ({
  wakeSyncBackground: vi.fn(),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync-wakeup", () => syncWakeMocks);

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

  it("keeps explicit private tales local-only", async () => {
    await markNewTaleSyncPreference("local-1", "private");

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "private",
    });
    expect(syncWakeMocks.wakeSyncBackground).not.toHaveBeenCalled();
  });

  it("keeps new tales private when sync is disabled on this device", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValueOnce({ enabled: false });

    await markNewTaleSyncPreference("local-1");

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "private",
    });
  });

  it("keeps new tales private before the active profile is connected", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValueOnce(null);

    await markNewTaleSyncPreference("local-1");

    expect(syncRepoMocks.setTaleSyncPreference).toHaveBeenCalledWith({
      profileId: "hosted",
      localTaleId: "local-1",
      policy: "private",
    });
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
});
