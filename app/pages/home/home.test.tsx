import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./home";

const mocks = vi.hoisted(() => ({
  catalog: {
    baseUrl: "https://cloud.example",
    enabled: false,
    loading: true,
    error: null as unknown,
    capabilities: null,
  },
  publicScenarios: {
    items: [] as Array<{
      id: string;
      title: string;
      summary: string;
      thumbnail: null;
    }>,
    loading: false,
    error: null as unknown,
  },
  loadTale: vi.fn(),
  navigate: vi.fn(),
  getSyncProfile: vi.fn(),
  tales: {
    items: [] as unknown[],
    syncActive: false,
  },
  syncSettings: {} as Record<string, unknown>,
}));

const signedOutSyncSettings = {
  cloudBaseUrl: "https://cloud.example",
  personalBaseUrl: "",
  activeSyncMode: "hosted",
  accessToken: "",
  accessTokenExpiresAt: null,
  hasRefreshToken: false,
  hostedRefreshFailed: false,
  cloudUpdateRequired: false,
  deviceId: "device-1",
  accountId: "",
  hostedDeviceIdsByAccountId: {},
  deviceName: "Desktop",
  devicePlatform: "Windows",
  accountDisplayName: "",
  accountEmail: "",
};

function syncedTale(
  name: string,
  status: string,
  lastErrorCode: string | null = null,
) {
  return {
    source: "local",
    localTale: {
      id: name,
      name,
      description: "",
      thumbnail: null,
      updatedAt: 1,
    },
    sync: {
      profileId: "hosted",
      remoteTaleId: `remote-${name}`,
      metadataRev: "1",
      status,
      lastErrorCode,
    },
  };
}

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => Promise.resolve("1.0.0"),
}));
vi.mock("@/hooks/useCatalogScenarios", () => ({
  useCatalogClient: () => mocks.catalog,
  useCatalogScenarioList: () => mocks.publicScenarios,
}));
vi.mock("@/hooks/useGameSaves", () => ({
  useLoadTale: () => ({ load: mocks.loadTale }),
}));
vi.mock("@/hooks/useTaleLibrary", () => ({
  useTaleLibrary: () => ({
    items: mocks.tales.items,
    loading: false,
    error: null,
    remoteError: null,
    syncActive: mocks.tales.syncActive,
    syncStatesLoading: false,
  }),
}));
vi.mock("@/hooks/useScenarios", () => ({
  useScenariosList: () => ({
    items: [
      {
        id: "local-scenario",
        name: "Local scenario",
        description: "Already stored on this device.",
        initialGameMode: "story_teller",
        thumbnail: null,
      },
    ],
    loading: false,
    error: null,
  }),
}));
vi.mock("@/store/useSettingsStore", () => {
  const role = { baseUrl: "https://model.example", model: "narrator" };
  const state = { modelRoles: { narrator: role, utility: role } };
  return {
    useSettingsStore: (select: (value: typeof state) => unknown) =>
      select(state),
    isModelRoleConfigured: () => true,
  };
});
vi.mock("@/store/useSyncSettingsStore", () => ({
  useSyncSettingsStore: (select: (value: Record<string, unknown>) => unknown) =>
    select(mocks.syncSettings),
}));
vi.mock("@/store/useTaleStore", () => ({
  useTaleStore: () => ({ id: "", name: "", description: "", log: [] }),
}));
vi.mock("@/store/useLastPlayedStore", () => ({
  useLastPlayedStore: () => ({ lastPlayedTaleId: null }),
}));
vi.mock("@/store/useUpdateStore", () => {
  const state = {
    pendingChangelogVersion: null,
    pendingChangelogNotes: null,
    clearPendingChangelog: vi.fn(),
  };
  return {
    useUpdateStore: (select: (value: typeof state) => unknown) => select(state),
  };
});
vi.mock("@/store/useVersionStore", () => ({
  useVersionStore: () => ({
    lastSeenVersion: "1.0.0",
    setLastSeenVersion: vi.fn(),
  }),
}));
vi.mock("@/repositories/sync.repository", () => ({
  getSyncProfile: mocks.getSyncProfile,
  upsertSyncProfile: vi.fn(),
}));
vi.mock("@/services/sync", () => ({
  createSyncTransport: vi.fn(),
  registerSyncDevice: vi.fn(),
}));
vi.mock("@/components/scenario", async () => ({
  ...(await import("@/components/scenario/ScenarioPreviewCard")),
  GenerateScenarioDialog: () => null,
}));
vi.mock("@/components/layout/settings", () => ({ SettingsModal: () => null }));
vi.mock("@/components/layout", () => ({ WhatsNewModal: () => null }));
vi.mock("@/components/layout/server-announcement", () => ({
  ServerAnnouncementBanner: () => null,
}));
vi.mock("@/components/tales/tale-conflict-dialog", () => ({
  TaleConflictDialog: () => null,
}));

describe("Home catalog loading layout", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.assign(mocks.catalog, {
      baseUrl: "https://cloud.example",
      enabled: false,
      loading: true,
      error: null,
    });
    Object.assign(mocks.publicScenarios, {
      items: [],
      loading: false,
      error: null,
    });
    mocks.getSyncProfile.mockResolvedValue(null);
    mocks.tales.items = [];
    mocks.tales.syncActive = false;
    mocks.syncSettings = { ...signedOutSyncSettings };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => root.render(createElement(Home)));
  }

  function shelf(title: string) {
    return [...container.querySelectorAll("h2")]
      .find((heading) => heading.textContent === title)
      ?.closest("section");
  }

  function shelfTitles() {
    return [...container.querySelectorAll("h2")].map(
      (heading) => heading.textContent,
    );
  }

  it("reserves the public shelf before local scenarios throughout cloud startup", async () => {
    await render();
    const publicShelf = shelf("Public Scenarios");
    const localCard = container.querySelector(
      '[aria-label="Open Local scenario"]',
    );
    const localImage = localCard?.querySelector("img");
    const expectedOrder = [
      "Recent tales",
      "Public Scenarios",
      "Your Scenarios",
    ];
    expect(publicShelf).toBeDefined();
    expect(localCard).not.toBeNull();
    expect(shelfTitles()).toEqual(expectedOrder);
    expect(publicShelf?.textContent).toContain("Loading...");
    expect(publicShelf?.textContent).not.toContain("No public scenarios yet.");

    mocks.catalog.loading = false;
    mocks.catalog.enabled = true;
    mocks.publicScenarios.loading = true;
    await render();
    expect(shelf("Public Scenarios")).toBe(publicShelf);
    expect(shelfTitles()).toEqual(expectedOrder);
    expect(publicShelf?.textContent).toContain("Loading...");
    expect(publicShelf?.textContent).not.toContain("No public scenarios yet.");

    mocks.publicScenarios.loading = false;
    mocks.publicScenarios.items = [
      {
        id: "public-scenario",
        title: "Public scenario",
        summary: "Ready to play.",
        thumbnail: null,
      },
    ];
    await render();
    expect(shelf("Public Scenarios")).toBe(publicShelf);
    expect(shelfTitles()).toEqual(expectedOrder);
    expect(
      publicShelf?.querySelector('[aria-label="View Public scenario"]'),
    ).not.toBeNull();
    expect(publicShelf?.textContent).not.toContain("Loading...");
    expect(publicShelf?.textContent).not.toContain("No public scenarios yet.");
    expect(container.querySelector('[aria-label="Open Local scenario"]')).toBe(
      localCard,
    );
    expect(localCard?.querySelector("img")).toBe(localImage);
  });

  it("shows an empty state only after the available catalog finishes loading", async () => {
    mocks.catalog.loading = false;
    mocks.catalog.enabled = true;
    await render();
    const text = shelf("Public Scenarios")?.textContent;
    expect(text).toContain("No public scenarios yet.");
    expect(text).not.toContain("Loading...");
    expect(text).not.toContain("Public scenarios are unavailable.");
  });

  it.each(["capabilities", "list", "disabled"] as const)(
    "keeps a clear error state in the reserved shelf when %s is unavailable",
    async (failure) => {
      mocks.catalog.loading = false;
      mocks.catalog.enabled = failure === "list";
      mocks.catalog.error =
        failure === "capabilities" ? new Error("Offline") : null;
      mocks.publicScenarios.error =
        failure === "list" ? new Error("Offline") : null;
      await render();
      const text = shelf("Public Scenarios")?.textContent;
      expect(text).toContain("Public scenarios are unavailable.");
      expect(text).not.toContain("Loading...");
      expect(text).not.toContain("No public scenarios yet.");
      expect(shelfTitles()).toEqual([
        "Recent tales",
        "Public Scenarios",
        "Your Scenarios",
      ]);
    },
  );

  it("shows tales the cloud refused as failed, not as in the cloud", async () => {
    mocks.tales.syncActive = true;
    mocks.tales.items = [
      syncedTale("Full", "error", "quota_exceeded"),
      syncedTale("Huge", "error", "package_too_large"),
      syncedTale("Waiting", "push"),
      syncedTale("Retrying", "error", "sync_failed"),
    ];
    await render();

    const badge = (name: string) =>
      container.querySelector(`[aria-label="Load ${name}"]`)?.textContent;
    expect(badge("Full")).toContain("Cloud full");
    expect(badge("Huge")).toContain("Not synced");
    expect(badge("Waiting")).toContain("Cloud");
    expect(badge("Retrying")).toContain("Cloud");
    expect(badge("Retrying")).not.toContain("Not synced");
  });

  it("asks for an app update when the cloud refuses this version", async () => {
    mocks.syncSettings = {
      ...signedOutSyncSettings,
      accessToken: "token",
      accountId: "account-1",
      accountDisplayName: "Player",
      cloudUpdateRequired: true,
    };
    mocks.getSyncProfile.mockResolvedValue({
      enabled: true,
      disabledReason: null,
    });
    await render();
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Update Hakawati to sync");
    expect(container.textContent).not.toContain("Cloud sync on");
  });

  it("does not reserve a cloud shelf when no cloud server is configured", async () => {
    mocks.catalog.baseUrl = "";
    mocks.catalog.loading = false;
    await render();
    expect(shelfTitles()).toEqual(["Recent tales", "Your Scenarios"]);
    expect(shelf("Public Scenarios")).toBeUndefined();
  });
});
