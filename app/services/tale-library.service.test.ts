import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/repositories/tale.repository", () => ({}));
vi.mock("@/repositories/sync.repository", () => ({}));

import {
  removeLibraryTaleItemFromCloud,
  type SyncSession,
} from "@/services/tale-library.service";
import type { LibraryTaleItem } from "@/lib/tale-library";

describe("removeLibraryTaleItemFromCloud", () => {
  it("refuses a locked cloud tale instead of deleting the only copy", async () => {
    const item = {
      source: "remote",
      remoteTale: {
        id: "6f2f7d1e-3c4b-4a5d-9e8f-0a1b2c3d4e5f",
        title: "",
        locked: true,
        metadataRev: 3,
      },
    } as unknown as LibraryTaleItem;
    const session = {
      profile: { id: "hosted", accountId: "account-1", mode: "hosted" },
    } as unknown as SyncSession;

    await expect(
      removeLibraryTaleItemFromCloud(item, { session, syncActive: true }),
    ).rejects.toMatchObject({ code: "cloud_locked" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
