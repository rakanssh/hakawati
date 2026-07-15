import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultCloudBaseUrl,
  useSyncSettingsStore,
} from "./useSyncSettingsStore";

const partialize = useSyncSettingsStore.persist.getOptions().partialize!;
const merge = useSyncSettingsStore.persist.getOptions().merge!;
const migrate = useSyncSettingsStore.persist.getOptions().migrate!;

describe("useSyncSettingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSyncSettingsStore.setState({
      accessToken: "",
      accessTokenExpiresAt: null,
      hasRefreshToken: false,
      hostedRefreshFailed: false,
      accountId: "",
      accountDisplayName: "",
      accountEmail: "",
      hostedDeviceIdsByAccountId: {},
    });
  });

  it("keeps access tokens in memory and persists only the refresh marker", () => {
    const persisted = partialize({
      ...useSyncSettingsStore.getState(),
      accessToken: "token",
      accessTokenExpiresAt: 123,
      hasRefreshToken: true,
    });

    expect(persisted).toMatchObject({ hasRefreshToken: true });
    expect(persisted).not.toHaveProperty("accessToken");
    expect(persisted).not.toHaveProperty("accessTokenExpiresAt");
    expect(persisted).not.toHaveProperty("refreshToken");
  });

  it("does not rehydrate access tokens written by older releases", () => {
    expect(
      merge(
        {
          accessToken: "legacy-token",
          accessTokenExpiresAt: 123,
          hasRefreshToken: true,
        },
        {
          ...useSyncSettingsStore.getState(),
          accessToken: "in-memory-token",
          accessTokenExpiresAt: 456,
        },
      ),
    ).toMatchObject({
      accessToken: "",
      accessTokenExpiresAt: null,
      hasRefreshToken: true,
    });
    expect(
      migrate(
        {
          accessToken: "legacy-token",
          accessTokenExpiresAt: 123,
          hasRefreshToken: true,
        },
        0,
      ),
    ).toEqual({ hasRefreshToken: true });
  });

  it("rewrites legacy browser storage without the access token", async () => {
    localStorage.setItem(
      "sync-settings",
      JSON.stringify({
        state: {
          accessToken: "legacy-token",
          accessTokenExpiresAt: 123,
          hasRefreshToken: true,
        },
        version: 0,
      }),
    );

    await useSyncSettingsStore.persist.rehydrate();

    const stored = JSON.parse(
      localStorage.getItem("sync-settings") ?? "{}",
    ) as {
      state?: Record<string, unknown>;
      version?: number;
    };
    expect(stored.version).toBe(1);
    expect(stored.state).toMatchObject({ hasRefreshToken: true });
    expect(stored.state).not.toHaveProperty("accessToken");
    expect(stored.state).not.toHaveProperty("accessTokenExpiresAt");
  });

  it("does not keep a token after sign-out", () => {
    useSyncSettingsStore.setState({
      accessToken: "token",
      accessTokenExpiresAt: 123,
      hasRefreshToken: true,
      hostedRefreshFailed: true,
      accountId: "account-1",
      accountDisplayName: "Player",
      hostedDeviceIdsByAccountId: { "account-1": "device-1" },
    });

    useSyncSettingsStore.getState().clearSession();

    expect(useSyncSettingsStore.getState().hostedRefreshFailed).toBe(false);
    const persisted = partialize(useSyncSettingsStore.getState());
    expect(persisted).toMatchObject({
      hasRefreshToken: false,
      accountId: "",
      accountDisplayName: "",
      hostedDeviceIdsByAccountId: { "account-1": "device-1" },
    });
    expect(persisted).not.toHaveProperty("accessToken");
    expect(persisted).not.toHaveProperty("accessTokenExpiresAt");
  });

  it("clears hosted credentials when the hosted server changes", () => {
    useSyncSettingsStore.setState({
      cloudBaseUrl: "https://old.example",
      accessToken: "token",
      accessTokenExpiresAt: 123,
      hasRefreshToken: true,
      hostedRefreshFailed: true,
      accountId: "account-1",
      accountDisplayName: "Player",
      accountEmail: "player@example.com",
    });

    useSyncSettingsStore.getState().setCloudBaseUrl("https://new.example");

    expect(useSyncSettingsStore.getState()).toMatchObject({
      cloudBaseUrl: "https://new.example",
      accessToken: "",
      accessTokenExpiresAt: null,
      hasRefreshToken: false,
      hostedRefreshFailed: false,
      accountId: "",
      accountDisplayName: "",
      accountEmail: "",
    });
  });

  it("keeps hosted device ids scoped by account", () => {
    const first = useSyncSettingsStore
      .getState()
      .getOrCreateHostedDeviceId("account-1");
    const second = useSyncSettingsStore
      .getState()
      .getOrCreateHostedDeviceId("account-2");

    expect(first).not.toBe(second);
    expect(
      useSyncSettingsStore.getState().getOrCreateHostedDeviceId("account-1"),
    ).toBe(first);
    expect(partialize(useSyncSettingsStore.getState())).toMatchObject({
      hostedDeviceIdsByAccountId: {
        "account-1": first,
        "account-2": second,
      },
    });
  });

  it("uses the configured hosted sync server when stored settings are blank", () => {
    expect(defaultCloudBaseUrl(" https://sync.example/ ")).toBe(
      "https://sync.example/",
    );

    expect(
      merge(
        { cloudBaseUrl: "" },
        {
          ...useSyncSettingsStore.getState(),
          cloudBaseUrl: "https://env.example",
        },
      ),
    ).toMatchObject({
      cloudBaseUrl: "https://env.example",
    });
  });
});
