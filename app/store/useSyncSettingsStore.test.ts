import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultCloudBaseUrl,
  useSyncSettingsStore,
} from "./useSyncSettingsStore";

const partialize = useSyncSettingsStore.persist.getOptions().partialize!;
const merge = useSyncSettingsStore.persist.getOptions().merge!;

describe("useSyncSettingsStore", () => {
  beforeEach(() => {
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

  it("persists only the hosted refresh-token marker", () => {
    const persisted = partialize({
      ...useSyncSettingsStore.getState(),
      accessToken: "token",
      accessTokenExpiresAt: 123,
      hasRefreshToken: true,
    });

    expect(persisted).toMatchObject({
      accessToken: "token",
      accessTokenExpiresAt: 123,
      hasRefreshToken: true,
    });
    expect(persisted).not.toHaveProperty("refreshToken");
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
    expect(partialize(useSyncSettingsStore.getState())).toMatchObject({
      accessToken: "",
      accessTokenExpiresAt: null,
      hasRefreshToken: false,
      accountId: "",
      accountDisplayName: "",
      hostedDeviceIdsByAccountId: { "account-1": "device-1" },
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
