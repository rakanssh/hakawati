import { describe, expect, it } from "vitest";
import type { LibraryTaleItem } from "./tale-library";
import { getSyncUiKind, getTaleSyncBadge } from "./sync-ui";

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

  it("shows device limit before sign-in recovery prompts", () => {
    expect(
      getSyncUiKind({
        ...base,
        accountLabel: "Rakan",
        disabledReason: "device_limit",
      }),
    ).toBe("device-limit");
  });
});

describe("getTaleSyncBadge", () => {
  function localTale(
    sync?: Partial<
      NonNullable<Extract<LibraryTaleItem, { source: "local" }>["sync"]>
    >,
  ): LibraryTaleItem {
    return {
      source: "local",
      localTale: {} as Extract<
        LibraryTaleItem,
        { source: "local" }
      >["localTale"],
      ...(sync
        ? {
            sync: {
              profileId: "hosted",
              remoteTaleId: "remote-1",
              metadataRev: "1",
              status: "idle",
              lastErrorCode: null,
              ...sync,
            },
          }
        : {}),
    };
  }

  it("shows a full cloud as an error rather than a conflict", () => {
    expect(
      getTaleSyncBadge(
        localTale({ status: "error", lastErrorCode: "quota_exceeded" }),
      ),
    ).toBe("cloud-full");
  });

  it.each(["package_too_large", "400", "413"])(
    "shows a tale the cloud refused with %s as not synced",
    (lastErrorCode) => {
      expect(
        getTaleSyncBadge(localTale({ status: "error", lastErrorCode })),
      ).toBe("not-synced");
    },
  );

  it("keeps passing failures and pending work in the cloud", () => {
    for (const sync of [
      { status: "error" as const, lastErrorCode: "sync_failed" },
      { status: "push" as const },
      { status: "pull" as const },
      { status: "idle" as const },
    ]) {
      expect(getTaleSyncBadge(localTale(sync))).toBe("cloud");
    }
    expect(
      getTaleSyncBadge(
        localTale({ status: "conflict", lastErrorCode: "content_conflict" }),
      ),
    ).toBe("conflict");
    expect(getTaleSyncBadge(localTale())).toBe("local");
  });
});
