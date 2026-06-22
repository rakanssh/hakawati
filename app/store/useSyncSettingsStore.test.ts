import { beforeEach, describe, expect, it } from "vitest";
import { useSyncSettingsStore } from "./useSyncSettingsStore";

const partialize = useSyncSettingsStore.persist.getOptions().partialize!;

describe("useSyncSettingsStore", () => {
  beforeEach(() => {
    useSyncSettingsStore.setState({
      accessToken: "",
      accessTokenExpiresAt: null,
      hasRefreshToken: false,
      hostedRefreshFailed: false,
      accountDisplayName: "",
      accountEmail: "",
      accountEmailVerified: null,
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
      accountDisplayName: "Player",
    });

    useSyncSettingsStore.getState().clearSession();

    expect(useSyncSettingsStore.getState().hostedRefreshFailed).toBe(false);
    expect(partialize(useSyncSettingsStore.getState())).toMatchObject({
      accessToken: "",
      accessTokenExpiresAt: null,
      hasRefreshToken: false,
      accountDisplayName: "",
    });
  });
});
