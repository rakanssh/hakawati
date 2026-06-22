import { describe, expect, it } from "vitest";
import { getSyncUiKind } from "./sync-ui";

const base = {
  activeSyncMode: "hosted" as const,
  personalBaseUrl: "",
  accessToken: "",
  accessTokenExpiresAt: null,
  hasRefreshToken: false,
  accountLabel: "",
  now: 1000,
};

describe("getSyncUiKind", () => {
  it("shows reconnecting only while a silent refresh can still run", () => {
    expect(
      getSyncUiKind({
        ...base,
        accessToken: "old",
        accessTokenExpiresAt: 999,
        hasRefreshToken: true,
        accountLabel: "Rakan",
      }),
    ).toBe("reconnecting");

    expect(
      getSyncUiKind({
        ...base,
        accessToken: "old",
        accessTokenExpiresAt: 999,
        hasRefreshToken: true,
        accountLabel: "Rakan",
        refreshFailed: true,
      }),
    ).toBe("sign-in-required");
  });

  it("keeps disabled hosted profiles out of auto-reconnect", () => {
    expect(
      getSyncUiKind({
        ...base,
        hasRefreshToken: true,
        accountLabel: "Rakan",
        disabledReason: "user_disabled",
      }),
    ).toBe("sign-in-required");
  });
});
