import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsCloudSync from "./cloud-sync";

i18n.load("en", {});
i18n.activate("en");

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));

const syncStoreState = vi.hoisted(() => ({
  cloudBaseUrl: "https://sync.example",
  personalBaseUrl: "",
  activeSyncMode: "hosted" as "hosted" | "personal",
  accessToken: "token",
  accessTokenExpiresAt: null as number | null,
  hasRefreshToken: true,
  hostedRefreshFailed: false,
  deviceId: "device-1",
  accountId: "account-1",
  hostedDeviceIdsByAccountId: { "account-1": "device-1" },
  deviceName: "Laptop",
  devicePlatform: "windows",
  accountDisplayName: "Player",
  accountEmail: "player@example.com",
  accountEmailVerified: true as boolean | null,
  setCloudBaseUrl: vi.fn(),
  setPersonalBaseUrl: vi.fn(),
  setActiveSyncMode: vi.fn(),
  setAccessToken: vi.fn(),
  setAccount: vi.fn(),
  getOrCreateHostedDeviceId: vi.fn((accountId: string) =>
    accountId === "account-1" ? "device-1" : `device-${accountId}`,
  ),
  clearSession: vi.fn(),
  setDeviceName: vi.fn(),
  setDevicePlatform: vi.fn(),
}));

const syncRepoMocks = vi.hoisted(() => ({
  getSyncProfile: vi.fn(),
  setSyncProfileDisabled: vi.fn(),
  upsertSyncProfile: vi.fn(),
}));

const syncServiceMocks = vi.hoisted(() => ({
  createSyncTransport: vi.fn(() => ({})),
  fetchHostedAccountUsage: vi.fn(),
  fetchSyncCapabilities: vi.fn(),
  listHostedDevices: vi.fn(),
  prepareHostedSync: vi.fn(),
  registerSyncDevice: vi.fn(),
  signInHostedSync: vi.fn(),
  updateHostedAccountProfile: vi.fn(),
  unregisterHostedDevice: vi.fn(),
}));

const taleLibraryMocks = vi.hoisted(() => ({
  removeLibraryTaleFromCloud: vi.fn(),
}));

const syncWakeMocks = vi.hoisted(() => ({
  addSyncChangedListener: vi.fn(() => () => undefined),
  notifySyncChanged: vi.fn(),
  wakeSyncBackground: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.15.2"),
}));

vi.mock("@/store", () => ({
  useSyncSettingsStore: (selector: (state: typeof syncStoreState) => unknown) =>
    selector(syncStoreState),
}));

vi.mock("@/repositories/sync.repository", () => syncRepoMocks);
vi.mock("@/services/sync", () => syncServiceMocks);
vi.mock("@/services/sync-wakeup", () => syncWakeMocks);
vi.mock("@/services/secret-store", () => ({
  deleteHostedRefreshToken: vi.fn(),
  setHostedRefreshToken: vi.fn(),
}));
vi.mock("@/services/new-tale-sync", () => ({
  decideAllTaleSyncPreferences: vi.fn(),
  decideTaleSyncPreference: vi.fn(),
  listUndecidedTales: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/hooks/useTaleLibrary", () => ({
  useTaleLibrary: () => ({
    items: [
      {
        source: "remote",
        profileId: "hosted",
        remoteTale: {
          id: "remote-1",
          title: "Remote Tale",
          description: "Cloud tale",
          gameMode: "story_teller",
          coverAssetId: null,
          thumbnailAssetId: null,
          contentRev: 1,
          metadataRev: 1,
          turnCount: 1,
          entryCount: 1,
          storageBytes: 2048,
          updatedAt: "2026-06-21T00:00:00.000Z",
          lastEntryPreview: null,
        },
      },
    ],
    remoteLoading: false,
    remoteError: null,
    removeLibraryTaleFromCloud: taleLibraryMocks.removeLibraryTaleFromCloud,
  }),
}));
vi.mock("sonner", () => ({
  toast: toastMocks,
}));

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(I18nProvider, { i18n }, createElement(SettingsCloudSync)),
    );
  });
  return {
    container,
    cleanup() {
      act(() => root.unmount());
      container.remove();
      document.body.innerHTML = "";
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function device(id: string, name = "Laptop") {
  return {
    id,
    name,
    platform: "windows",
    appVersion: "0.15.2",
    createdAt: "2026-06-20T00:00:00.000Z",
    lastSeenAt: "2026-06-21T00:00:00.000Z",
  };
}

describe("SettingsCloudSync storage usage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    Object.assign(syncStoreState, {
      activeSyncMode: "hosted",
      accessToken: "token",
      accessTokenExpiresAt: null,
      accountId: "account-1",
      hostedDeviceIdsByAccountId: { "account-1": "device-1" },
      accountDisplayName: "Player",
      accountEmail: "player@example.com",
      hasRefreshToken: true,
    });
    syncStoreState.getOrCreateHostedDeviceId.mockImplementation(
      (accountId: string) =>
        accountId === "account-1" ? "device-1" : `device-${accountId}`,
    );
    syncRepoMocks.getSyncProfile.mockResolvedValue({
      enabled: true,
      disabledReason: null,
    });
    syncServiceMocks.fetchHostedAccountUsage.mockResolvedValue({
      tales: { used: 3, limit: 25 },
      storage: { usedBytes: 1.5 * 1024 * 1024, limitBytes: 50 * 1024 * 1024 },
    });
    syncServiceMocks.listHostedDevices.mockResolvedValue([
      device("device-1", "Laptop"),
      device("device-2", "Tablet"),
    ]);
    syncServiceMocks.unregisterHostedDevice.mockResolvedValue(undefined);
    syncServiceMocks.registerSyncDevice.mockResolvedValue(device("device-1"));
    taleLibraryMocks.removeLibraryTaleFromCloud.mockResolvedValue(undefined);
  });

  it("shows hosted usage limits", async () => {
    const view = render();
    await flush();

    expect(view.container.textContent).toContain("3/25 tales");
    expect(view.container.textContent).toContain("1.5 MB / 50 MB storage");

    view.cleanup();
  });

  it("removes a cloud tale from the manage storage dialog and refreshes usage", async () => {
    const view = render();
    await flush();

    const manage = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Manage storage"),
    );
    if (!manage) throw new Error("Manage storage button did not render");
    act(() => {
      manage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(document.body.textContent).toContain("Remote Tale");
    const bars = [
      ...document.body.querySelectorAll('[data-slot="progress-indicator"]'),
    ];
    expect(bars).toHaveLength(2);
    expect(bars[0]?.getAttribute("style")).toContain("translateX(-88%)");
    expect(bars[1]?.getAttribute("style")).toContain("translateX(-97%)");

    const remove = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Remove from cloud"),
    );
    if (!remove) throw new Error("Remove button did not render");
    await act(async () => {
      remove.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(taleLibraryMocks.removeLibraryTaleFromCloud).toHaveBeenCalled();
    expect(syncServiceMocks.fetchHostedAccountUsage).toHaveBeenCalledTimes(2);

    view.cleanup();
  });

  it("lists hosted devices and disables unregister for the current device", async () => {
    const view = render();
    await flush();

    const manage = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Manage devices"),
    );
    if (!manage) throw new Error("Manage devices button did not render");
    act(() => {
      manage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(document.body.textContent).toContain("2/2");
    expect(document.body.textContent).toContain("Laptop");
    expect(document.body.textContent).toContain("Tablet");
    expect(document.body.textContent).toContain("Current");
    const current = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Current device"),
    );
    expect(current).toHaveProperty("disabled", true);

    view.cleanup();
  });

  it("unregisters another hosted device and refreshes the list", async () => {
    syncServiceMocks.listHostedDevices
      .mockResolvedValueOnce([
        device("device-1", "Laptop"),
        device("device-2", "Tablet"),
      ])
      .mockResolvedValueOnce([device("device-1", "Laptop")]);
    const view = render();
    await flush();

    const manage = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Manage devices"),
    );
    if (!manage) throw new Error("Manage devices button did not render");
    act(() => {
      manage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const unregister = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Unregister"),
    );
    if (!unregister) throw new Error("Unregister button did not render");
    await act(async () => {
      unregister.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncServiceMocks.unregisterHostedDevice).toHaveBeenCalledWith(
      {},
      "device-2",
    );
    expect(syncServiceMocks.listHostedDevices).toHaveBeenCalledTimes(2);

    view.cleanup();
  });

  it("registers the current hosted device after freeing a slot", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({
      enabled: false,
      disabledReason: "device_limit",
    });
    syncServiceMocks.listHostedDevices
      .mockResolvedValueOnce([
        device("device-2", "Tablet"),
        device("device-3", "Phone"),
      ])
      .mockResolvedValueOnce([device("device-3", "Phone")])
      .mockResolvedValueOnce([
        device("device-1", "Laptop"),
        device("device-3", "Phone"),
      ]);
    const view = render();
    await flush();

    const manage = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Manage devices"),
    );
    if (!manage) throw new Error("Manage devices button did not render");
    act(() => {
      manage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const unregister = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Unregister"),
    );
    if (!unregister) throw new Error("Unregister button did not render");
    await act(async () => {
      unregister.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncServiceMocks.registerSyncDevice).toHaveBeenCalledWith(
      {},
      {
        id: "device-1",
        name: "Laptop",
        platform: "windows",
        appVersion: "0.15.2",
      },
    );
    expect(syncRepoMocks.upsertSyncProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hosted",
        enabled: true,
        disabledReason: null,
      }),
    );
    expect(syncWakeMocks.wakeSyncBackground).toHaveBeenCalled();
    expect(syncWakeMocks.notifySyncChanged).toHaveBeenCalled();

    view.cleanup();
  });

  it("keeps the device dialog open when current device registration fails", async () => {
    syncRepoMocks.getSyncProfile.mockResolvedValue({
      enabled: false,
      disabledReason: "device_limit",
    });
    syncServiceMocks.listHostedDevices
      .mockResolvedValueOnce([
        device("device-2", "Tablet"),
        device("device-3", "Phone"),
      ])
      .mockResolvedValueOnce([device("device-3", "Phone")]);
    syncServiceMocks.registerSyncDevice.mockRejectedValue(
      new Error("Device limit reached"),
    );
    const view = render();
    await flush();

    const manage = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Manage devices"),
    );
    if (!manage) throw new Error("Manage devices button did not render");
    act(() => {
      manage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const unregister = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Unregister"),
    );
    if (!unregister) throw new Error("Unregister button did not render");
    await act(async () => {
      unregister.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Manage devices");
    expect(document.body.textContent).toContain("Devices are unavailable.");
    expect(toastMocks.error).toHaveBeenCalledWith("Device limit reached");

    view.cleanup();
  });
});
