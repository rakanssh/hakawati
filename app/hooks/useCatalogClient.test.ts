import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudCapabilities } from "@/services/cloud-capabilities";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import {
  useCatalogClient,
  type CatalogClientState,
} from "./useCatalogScenarios";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/services/catalog.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/catalog.service")>()),
  fetchCatalogCapabilities: mocks.fetch,
}));

const capabilities: CloudCapabilities = {
  server: "hakawati-cloud",
  apiVersion: "1",
  minimumClientVersion: "0.15.2",
  compatibility: { state: "compatible" },
  cloudSaveProtocol: 1,
  features: {
    sync: { state: "available" },
    catalogRead: { state: "available" },
    coverStorage: { state: "available" },
    publishing: { state: "available" },
  },
  limits: { maxPackageBytes: 1024, maxStateBytes: 1024 },
  scenarioCatalog: { packageFormatVersion: 1, thumbnailUploads: "enabled" },
  announcement: {
    id: "491c7ee0-a094-408a-84c9-7f3ee24b519a",
    en: { title: "From server A", body: "Hello" },
    expiresAt: "2030-01-01T00:00:00Z",
  },
};

function deferred() {
  let resolve!: (value: CloudCapabilities) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CloudCapabilities>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("catalog capability server scope", () => {
  let current: CatalogClientState;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch.mockReset();
    useSyncSettingsStore.setState({
      cloudBaseUrl: "https://a.example",
      accessToken: "",
      accountId: "",
    });
    root = createRoot(document.createElement("div"));
  });
  afterEach(() => act(() => root.unmount()));

  function render() {
    function Harness() {
      current = useCatalogClient();
      return null;
    }
    act(() => root.render(createElement(Harness)));
  }

  it("hides a previous server's notice immediately and ignores its retained refresh callback", async () => {
    mocks.fetch
      .mockResolvedValueOnce(capabilities)
      .mockReturnValueOnce(new Promise(() => {}));
    render();
    await act(async () => {});
    expect(current.capabilities?.announcement?.en.title).toBe("From server A");
    const refreshOldServer = current.refreshCapabilities;
    act(() =>
      useSyncSettingsStore.getState().setCloudBaseUrl("https://b.example"),
    );
    expect(current.capabilities).toBeNull();
    expect(current.loading).toBe(true);
    await act(async () => refreshOldServer());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("ignores old server responses, errors, and finalizers", async () => {
    const old = deferred();
    const newer = deferred();
    mocks.fetch
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(newer.promise);
    render();
    act(() =>
      useSyncSettingsStore.getState().setCloudBaseUrl("https://b.example"),
    );
    await act(async () => old.reject(new Error("old server unavailable")));
    expect(current.error).toBeNull();
    expect(current.loading).toBe(true);
    await act(async () =>
      newer.resolve({ ...capabilities, announcement: null }),
    );
    expect(current.capabilities?.announcement).toBeNull();
    expect(current.enabled).toBe(true);
    expect(current.loading).toBe(false);
  });

  it("keeps the newest refresh result and clears capabilities when the server is removed", async () => {
    const first = deferred();
    const second = deferred();
    mocks.fetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render();
    act(() => {
      void current.refreshCapabilities();
    });
    await act(async () =>
      second.resolve({ ...capabilities, announcement: null }),
    );
    await act(async () => first.resolve(capabilities));
    expect(current.capabilities?.announcement).toBeNull();
    act(() => useSyncSettingsStore.getState().setCloudBaseUrl(""));
    expect(current.capabilities).toBeNull();
    expect(current.enabled).toBe(false);
    expect(current.loading).toBe(false);
  });
});
