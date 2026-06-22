import { beforeEach, describe, expect, it } from "vitest";
import { useSyncSettingsStore } from "./useSyncSettingsStore";

const partialize = useSyncSettingsStore.persist.getOptions().partialize!;

describe("useSyncSettingsStore", () => {
  beforeEach(() => {
    useSyncSettingsStore.setState({
      accessToken: "",
      accessTokenExpiresAt: null,
      refreshToken: "",
      accountDisplayName: "",
      accountEmail: "",
      accountEmailVerified: null,
    });
  });

  it("persists hosted tokens for silent refresh", () => {
    const persisted = partialize({
      ...useSyncSettingsStore.getState(),
      accessToken: "token",
      accessTokenExpiresAt: 123,
      refreshToken: "refresh-token",
    });

    expect(persisted).toMatchObject({
      accessToken: "token",
      accessTokenExpiresAt: 123,
      refreshToken: "refresh-token",
    });
  });

  it("does not keep a token after sign-out", () => {
    useSyncSettingsStore.setState({
      accessToken: "token",
      accessTokenExpiresAt: 123,
      refreshToken: "refresh-token",
      accountDisplayName: "Player",
    });

    useSyncSettingsStore.getState().clearSession();

    expect(partialize(useSyncSettingsStore.getState())).toMatchObject({
      accessToken: "",
      accessTokenExpiresAt: null,
      refreshToken: "",
      accountDisplayName: "",
    });
  });
});
