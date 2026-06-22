import { describe, expect, it } from "vitest";
import { GameMode } from "@/types/context.type";
import type { TaleHead } from "@/types/tale.type";
import type { RemoteTale } from "@/services/sync";
import type { TaleSyncState } from "@/repositories/sync.repository";
import { mergeTaleLibrary } from "./tale-library";

describe("mergeTaleLibrary", () => {
  it("dedupes linked remote tales and keeps remote-only tales visible", () => {
    const localTales: TaleHead[] = [
      localTale("local-linked", "Linked Local", 10),
      localTale("local-only", "Local Only", 30),
    ];
    const remoteTales: RemoteTale[] = [
      remoteTale("remote-linked", "Linked Remote", 40),
      remoteTale("remote-only", "Remote Only", 20),
    ];
    const syncStates: TaleSyncState[] = [
      {
        profileId: "hosted",
        localTaleId: "local-linked",
        remoteTaleId: "remote-linked",
        contentRev: "1",
        metadataRev: "1",
        lastSyncedAt: 1,
        pendingStatus: "error",
        lastErrorCode: "email_not_verified",
      },
    ];

    const items = mergeTaleLibrary({
      localTales,
      remoteTales,
      syncStates,
      profileId: "hosted",
    });

    expect(items.map((item) => item.source)).toEqual([
      "local",
      "remote",
      "local",
    ]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      source: "local",
      localTale: { id: "local-only" },
    });
    expect(items[1]).toMatchObject({
      source: "remote",
      remoteTale: { id: "remote-only" },
      profileId: "hosted",
    });
    expect(items[2]).toMatchObject({
      source: "local",
      localTale: { id: "local-linked" },
      sync: {
        remoteTaleId: "remote-linked",
        status: "error",
        lastErrorCode: "email_not_verified",
        remoteTale: { id: "remote-linked", turnCount: 1 },
      },
    });
  });
});

function localTale(id: string, name: string, updatedAt: number): TaleHead {
  return {
    id,
    name,
    description: "",
    thumbnail: null,
    createdAt: updatedAt,
    scenarioId: null,
    logCount: 1,
    updatedAt,
    lastLogEntry: null,
    scenarioHead: null,
  };
}

function remoteTale(id: string, title: string, updatedAt: number): RemoteTale {
  return {
    id,
    title,
    description: null,
    gameMode: GameMode.STORY_TELLER,
    coverAssetId: null,
    thumbnailAssetId: null,
    contentRev: 1,
    metadataRev: 1,
    turnCount: 1,
    updatedAt: new Date(updatedAt).toISOString(),
    lastEntryPreview: null,
  };
}
