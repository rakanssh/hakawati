import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode } from "@/types/context.type";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import type { TalePackageV1 } from "@/types/export.type";
import {
  canUploadCoverAssets,
  createSyncTransport,
  deleteRemoteTale,
  fetchHostedAccountUsage,
  importRemoteTalePackage,
  keepBothTalePackage,
  listHostedDevices,
  prepareHostedSync,
  pushTaleContentBatch,
  pushTaleMetadataPatch,
  registerSyncDevice,
  refreshHostedSync,
  replaceRemoteTalePackage,
  remoteTaleChanged,
  signInHostedSync,
  syncLinkedTale,
  SyncHttpError,
  toSyncTalePackage,
  updateHostedAccountProfile,
  unregisterHostedDevice,
  uploadTalePackage,
  applyRemoteTalePackage,
} from "./sync";

const http = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const opener = vi.hoisted(() => ({
  openUrl: vi.fn(),
}));

const taleRepo = vi.hoisted(() => ({
  exportTalePackage: vi.fn(),
  importTalePackage: vi.fn(),
  replaceTaleWithPackage: vi.fn(),
}));

const syncRepo = vi.hoisted(() => ({
  getTaleSyncState: vi.fn(),
  setSyncProfileDisabled: vi.fn(),
  setTaleSyncStatus: vi.fn(),
  upsertSyncProfile: vi.fn(),
  upsertTaleSyncState: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: http.fetch,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriCore.invoke,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: opener.openUrl,
}));

vi.mock("@/repositories/tale.repository", () => ({
  exportTalePackage: taleRepo.exportTalePackage,
  importTalePackage: taleRepo.importTalePackage,
  replaceTaleWithPackage: taleRepo.replaceTaleWithPackage,
}));

vi.mock("@/repositories/sync.repository", () => syncRepo);

function samplePackage(): TalePackageV1 {
  return {
    format: "hakawati-tale-package",
    formatVersion: 1,
    exportedAt: "2026-06-19T00:00:00.000Z",
    tale: {
      id: "local-tale",
      title: "Local Tale",
      description: "Has a local thumbnail.",
      gameMode: GameMode.STORY_TELLER,
      thumbnailAssetId: "thumbnail",
      createdAt: 1,
      updatedAt: 2,
      schemaVersion: 1,
    },
    state: {
      stateSchemaVersion: 1,
      data: {
        components: [],
        storyCards: [],
        gm: {
          stats: [],
          inventory: [],
          scratchpad: {},
        },
      },
    },
    turns: [
      {
        id: "turn-1",
        seq: 1,
        createdAt: 3,
        updatedAt: 4,
        entries: [
          {
            id: "entry-1",
            role: LogEntryRole.GM,
            mode: LogEntryMode.STORY,
            text: "Once.",
          },
        ],
      },
    ],
    assets: [
      {
        id: "thumbnail",
        role: "thumbnail",
        contentType: "image/png",
        dataBase64: "abcd",
      },
    ],
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe("sync transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps hosted auth/device headers in transport and leaves personal mode bare", async () => {
    http.fetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('{"ok":true}'),
    });
    const hosted = createSyncTransport({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example/v1/",
        mode: "hosted",
      },
      accessToken: "token",
      deviceId: "device-1",
    });

    await hosted.post("/v1/tales", { a: 1 }, { idempotencyKey: "idem-1" });

    expect(http.fetch).toHaveBeenLastCalledWith(
      "https://sync.example/v1/tales",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
          "X-Hakawati-Device-Id": "device-1",
          "Idempotency-Key": "idem-1",
        },
      }),
    );

    http.fetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("{}"),
    });
    const personal = createSyncTransport({
      profile: {
        id: "home",
        baseUrl: "http://127.0.0.1:8787",
        mode: "personal",
      },
      accessToken: "ignored",
      deviceId: "ignored",
    });

    await personal.post("/v1/tales", {}, { idempotencyKey: "idem-2" });

    expect(http.fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8787/v1/tales",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-2",
        },
      }),
    );
  });

  it("throws status and code from remote errors", async () => {
    http.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () =>
        Promise.resolve('{"code":"content_conflict","message":"Conflict"}'),
    });

    await expect(
      createSyncTransport({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
      }).post("/v1/tales", {}),
    ).rejects.toMatchObject({
      status: 409,
      code: "content_conflict",
    } satisfies Partial<SyncHttpError>);
  });

  it("uses server error type when code is absent", async () => {
    http.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () =>
        Promise.resolve('{"type":"metadata_conflict","message":"Conflict"}'),
    });

    await expect(
      createSyncTransport({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
      }).patch("/v1/tales/remote/metadata", {}),
    ).rejects.toMatchObject({
      status: 409,
      code: "metadata_conflict",
    } satisfies Partial<SyncHttpError>);
  });

  it("maps hosted packages to cover references without inline asset bytes", () => {
    const hostedPackage = toSyncTalePackage(samplePackage(), {
      mode: "hosted",
      coverAssetId: "remote-cover",
    });

    expect(hostedPackage.assets).toEqual([]);
    expect(hostedPackage.tale.coverAssetId).toBe("remote-cover");
    expect(hostedPackage.tale.thumbnailAssetId).toBe("remote-cover");
    expect("updatedAt" in hostedPackage.turns[0]).toBe(false);
    expect((hostedPackage.turns[0].entries[0] as { text: string }).text).toBe(
      "Once.",
    );
  });

  it("maps personal packages without cover/image data", () => {
    const personalPackage = toSyncTalePackage(samplePackage(), {
      mode: "personal",
    });

    expect(personalPackage.assets).toEqual([]);
    expect(personalPackage.tale.coverAssetId).toBeUndefined();
    expect(personalPackage.tale.thumbnailAssetId).toBeUndefined();
  });

  it("preserves tale source metadata inside synced state data", () => {
    const syncPackage = toSyncTalePackage(
      {
        ...samplePackage(),
        tale: {
          ...samplePackage().tale,
          source: {
            type: "catalog",
            scenarioId: "catalog-1",
            scenarioVersionId: "version-1",
            scenarioTitle: "Iron Gate",
          },
        },
      },
      { mode: "hosted" },
    );

    expect(syncPackage.state.data).toMatchObject({
      source: {
        type: "catalog",
        scenarioId: "catalog-1",
        scenarioVersionId: "version-1",
        scenarioTitle: "Iron Gate",
      },
    });
    expect("source" in syncPackage.tale).toBe(false);
  });

  it("keeps account, device, provider, and session fields out of sync packages", () => {
    const syncPackage = toSyncTalePackage(
      {
        ...samplePackage(),
        tale: {
          ...samplePackage().tale,
          accountId: "account-1",
          deviceId: "device-1",
          accessToken: "token",
        } as TalePackageV1["tale"],
        state: {
          ...samplePackage().state,
          data: {
            ...samplePackage().state.data,
            undoStack: [],
            providerApiKey: "secret",
          },
        } as TalePackageV1["state"],
      },
      { mode: "hosted" },
    );
    const text = JSON.stringify(syncPackage);

    for (const forbidden of [
      "accountId",
      "deviceId",
      "accessToken",
      "undoStack",
      "providerApiKey",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("uploads hosted covers and references the uploaded cover in tale create", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    http.fetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(""),
    });
    const transport = {
      get: vi.fn(),
      post: vi.fn(async (path: string, _body?: unknown, _options?: unknown) => {
        if (path === "/v1/assets/cover-upload-intents") {
          return {
            asset: { assetId: "remote-cover" },
            upload: {
              method: "PUT",
              url: "https://upload.example/remote-cover",
              headers: { "Content-Type": "image/png" },
            },
          };
        }
        if (path === "/v1/assets/remote-cover/complete") {
          return { asset: { assetId: "remote-cover" } };
        }
        return {
          id: "remote-tale",
          contentRev: 7,
          metadataRev: 9,
        };
      }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await uploadTalePackage({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      idempotencyKey: "idem-upload",
      capabilities: { features: { coverAssets: "enabled" } },
    });

    expect(transport.post).toHaveBeenNthCalledWith(
      1,
      "/v1/assets/cover-upload-intents",
      expect.objectContaining({
        visibility: "private",
        contentType: "image/png",
        byteSize: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(http.fetch).toHaveBeenCalledWith(
      "https://upload.example/remote-cover",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: expect.any(Blob),
      }),
    );
    expect(transport.post).toHaveBeenNthCalledWith(
      2,
      "/v1/assets/remote-cover/complete",
      {},
    );
    const createBody = transport.post.mock.calls[2][1] as {
      package: { tale: unknown; assets: Array<{ dataBase64?: string }> };
    };
    expect(createBody.package).toMatchObject({
      tale: {
        coverAssetId: "remote-cover",
        thumbnailAssetId: "remote-cover",
      },
      assets: [],
    });
    expect(createBody.package.assets[0]?.dataBase64).toBeUndefined();
  });

  it("accepts legacy thumbnail capability for hosted cover uploads", () => {
    expect(canUploadCoverAssets({ features: { thumbnails: "enabled" } })).toBe(
      true,
    );
  });

  it("uses the sync mapper for personal uploads instead of raw local export", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 7,
        metadataRev: 9,
      }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await uploadTalePackage({
      profile: {
        id: "home",
        baseUrl: "http://127.0.0.1:8787",
        mode: "personal",
      },
      transport,
      localTaleId: "local-tale",
      idempotencyKey: "idem-upload",
      capabilities: { features: { coverAssets: "unsupported" } },
    });

    const body = transport.post.mock.calls[0][1];
    expect(body.package.assets).toEqual([]);
    expect(body.package.tale.thumbnailAssetId).toBeUndefined();
    expect(body.package.turns[0].updatedAt).toBeUndefined();
  });

  it("deletes remote tales with baseMetadataRev", async () => {
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await deleteRemoteTale(transport, "remote-tale", 7);

    expect(transport.delete).toHaveBeenCalledWith(
      "/v1/tales/remote-tale?baseMetadataRev=7",
    );
  });

  it("stores numeric server revisions as text after hosted upload", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 7,
        metadataRev: 9,
      }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await uploadTalePackage({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      idempotencyKey: "idem-upload",
    });

    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentRev: "7",
        metadataRev: "9",
        pendingStatus: "idle",
      }),
    );
  });

  it("does not link a local tale when hosted upload rejects an unregistered device", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    const transport = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new SyncHttpError(
            "Register this device before using cloud saves",
            403,
            "403",
          ),
        ),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      uploadTalePackage({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        idempotencyKey: "idem-upload",
      }),
    ).rejects.toThrow("Register this device before using cloud saves");

    expect(syncRepo.upsertTaleSyncState).not.toHaveBeenCalled();
    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "cloud",
      localTaleId: "local-tale",
      pendingStatus: "error",
      lastErrorCode: "403",
    });
    expect(syncRepo.setSyncProfileDisabled).toHaveBeenCalledWith(
      "cloud",
      "device_limit",
    );
  });

  it("sends baseContentRev from sync state when replacing remote package", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "12",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "conflict",
      lastErrorCode: null,
    });
    const transport = {
      get: vi.fn().mockResolvedValue({ features: {} }),
      post: vi.fn(),
      put: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 13,
        metadataRev: 4,
      }),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await replaceRemoteTalePackage({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      idempotencyKey: "idem-replace",
    });

    expect(transport.put).toHaveBeenCalledWith(
      "/v1/tales/remote-tale/package",
      expect.objectContaining({
        baseContentRev: 12,
        confirmReplace: true,
      }),
      { idempotencyKey: "idem-replace" },
    );
    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        remoteTaleId: "remote-tale",
        contentRev: "13",
        metadataRev: "4",
        pendingStatus: "idle",
        lastErrorCode: null,
      }),
    );
  });

  it("omits baseContentRev when force replacing a conflicted remote package", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "12",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "conflict",
      lastErrorCode: "remote_changed",
    });
    const transport = {
      get: vi.fn().mockResolvedValue({ features: {} }),
      post: vi.fn(),
      put: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 13,
        metadataRev: 4,
      }),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await replaceRemoteTalePackage({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      idempotencyKey: "idem-force-replace",
      forceReplace: true,
    });

    const [, body] = transport.put.mock.calls[0];
    expect(body).toMatchObject({
      confirmReplace: true,
      package: expect.any(Object),
    });
    expect(body).not.toHaveProperty("baseContentRev");
  });

  it("pushes local turns after the remote turn count and stores returned revisions", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce({
      ...samplePackage(),
      turns: [
        ...samplePackage().turns,
        {
          id: "turn-2",
          seq: 2,
          createdAt: 5,
          updatedAt: 6,
          entries: [
            {
              id: "entry-2",
              role: LogEntryRole.PLAYER,
              mode: LogEntryMode.DO,
              text: "Open the gate.",
            },
          ],
        },
      ],
    });
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 3,
        metadataRev: 3,
        turnCount: 2,
      }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await pushTaleContentBatch({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      remoteTale: { turnCount: 1 },
      idempotencyKey: "idem-content",
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/tales/remote-tale/content-batch",
      expect.objectContaining({
        baseContentRev: 2,
        turns: [expect.objectContaining({ id: "turn-2", seq: 2 })],
        stateAfter: expect.objectContaining({ stateSchemaVersion: 1 }),
      }),
      { idempotencyKey: "idem-content" },
    );
    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentRev: "3",
        metadataRev: "3",
        pendingStatus: "idle",
        lastErrorCode: null,
      }),
    );
  });

  it("keeps local data and records error when content push fails", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockRejectedValue(new Error("offline")),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      pushTaleContentBatch({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        remoteTale: { turnCount: 0 },
        idempotencyKey: "idem-content",
      }),
    ).rejects.toThrow("offline");

    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "cloud",
      localTaleId: "local-tale",
      pendingStatus: "error",
      lastErrorCode: "sync_failed",
    });
  });

  it("marks content push revision conflicts explicitly", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const transport = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new SyncHttpError("Conflict", 409, "content_conflict"),
        ),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      pushTaleContentBatch({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        remoteTale: { turnCount: 0 },
        idempotencyKey: "idem-content",
      }),
    ).rejects.toMatchObject({ code: "content_conflict" });

    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "cloud",
      localTaleId: "local-tale",
      pendingStatus: "conflict",
      lastErrorCode: "content_conflict",
    });
  });

  it("patches linked tale metadata with baseMetadataRev", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 2,
        metadataRev: 4,
      }),
      delete: vi.fn(),
    };

    await pushTaleMetadataPatch({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
    });

    expect(transport.patch).toHaveBeenCalledWith(
      "/v1/tales/remote-tale/metadata",
      {
        baseMetadataRev: 3,
        title: "Local Tale",
        description: "Has a local thumbnail.",
        gameMode: GameMode.STORY_TELLER,
      },
    );
    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentRev: "2",
        metadataRev: "4",
        pendingStatus: "idle",
      }),
    );
  });

  it("detects when a listed remote tale has newer revisions", () => {
    const state = {
      remoteTaleId: "remote-tale",
      contentRev: "7",
      metadataRev: "9",
    };
    const remote = {
      id: "remote-tale",
      title: "Remote Tale",
      description: null,
      gameMode: GameMode.STORY_TELLER,
      coverAssetId: null,
      thumbnailAssetId: null,
      contentRev: 8,
      metadataRev: 9,
      turnCount: 1,
      updatedAt: "2026-06-19T00:00:00.000Z",
      lastEntryPreview: null,
    };

    expect(remoteTaleChanged(state, remote)).toBe(true);
    expect(remoteTaleChanged(state, { ...remote, id: "other" })).toBe(false);
  });

  it("pulls listed remote changes when the linked local tale is idle", async () => {
    syncRepo.getTaleSyncState
      .mockResolvedValueOnce({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      })
      .mockResolvedValueOnce({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      });
    const transport = {
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 4,
        metadataRev: 3,
        turnCount: 1,
        package: toSyncTalePackage(samplePackage(), { mode: "hosted" }),
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    const result = await syncLinkedTale({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      remoteTale: {
        id: "remote-tale",
        title: "Remote Tale",
        description: null,
        gameMode: GameMode.STORY_TELLER,
        coverAssetId: null,
        thumbnailAssetId: null,
        contentRev: 4,
        metadataRev: 3,
        turnCount: 1,
        updatedAt: "2026-06-19T00:00:00.000Z",
        lastEntryPreview: null,
      },
      idempotencyKey: "idem-sync",
    });

    expect(result).toBe("pulled");
    expect(taleRepo.replaceTaleWithPackage).toHaveBeenCalledWith(
      "local-tale",
      expect.objectContaining({
        format: "hakawati-tale-package",
      }),
    );
    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentRev: "4",
        metadataRev: "3",
        pendingStatus: "idle",
      }),
    );
  });

  it("marks idle linked tales as error when automatic pull fails", async () => {
    syncRepo.getTaleSyncState
      .mockResolvedValueOnce({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      })
      .mockResolvedValueOnce({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "idle",
        lastErrorCode: null,
      });
    const transport = {
      get: vi
        .fn()
        .mockRejectedValue(new SyncHttpError("Unauthorized", 401, "auth")),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      syncLinkedTale({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        remoteTale: {
          id: "remote-tale",
          title: "Remote Tale",
          description: null,
          gameMode: GameMode.STORY_TELLER,
          coverAssetId: null,
          thumbnailAssetId: null,
          contentRev: 4,
          metadataRev: 3,
          turnCount: 1,
          updatedAt: "2026-06-19T00:00:00.000Z",
          lastEntryPreview: null,
        },
        idempotencyKey: "idem-sync",
      }),
    ).rejects.toMatchObject({ code: "auth" });

    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "cloud",
      localTaleId: "local-tale",
      pendingStatus: "error",
      lastErrorCode: "auth",
    });
    expect(taleRepo.replaceTaleWithPackage).not.toHaveBeenCalled();
  });

  it("marks a conflict when local pending work and remote revisions both moved", async () => {
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    const result = await syncLinkedTale({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      remoteTale: {
        id: "remote-tale",
        title: "Remote Tale",
        description: null,
        gameMode: GameMode.STORY_TELLER,
        coverAssetId: null,
        thumbnailAssetId: null,
        contentRev: 4,
        metadataRev: 3,
        turnCount: 1,
        updatedAt: "2026-06-19T00:00:00.000Z",
        lastEntryPreview: null,
      },
      idempotencyKey: "idem-sync",
    });

    expect(result).toBe("conflict");
    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "cloud",
      localTaleId: "local-tale",
      pendingStatus: "conflict",
      lastErrorCode: "remote_changed",
    });
    expect(transport.post).not.toHaveBeenCalled();
  });

  it("replaces the remote package when local work rewrites an already-synced turn", async () => {
    taleRepo.exportTalePackage
      .mockResolvedValueOnce(samplePackage())
      .mockResolvedValueOnce(samplePackage());
    syncRepo.getTaleSyncState
      .mockResolvedValueOnce({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "push",
        lastErrorCode: null,
      })
      .mockResolvedValueOnce({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "push",
        lastErrorCode: null,
      })
      .mockResolvedValueOnce({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "push",
        lastErrorCode: null,
      });
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 3,
        metadataRev: 4,
      }),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    const result = await syncLinkedTale({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      remoteTale: {
        id: "remote-tale",
        title: "Local Tale",
        description: "Has a local thumbnail.",
        gameMode: GameMode.STORY_TELLER,
        coverAssetId: null,
        thumbnailAssetId: null,
        contentRev: 2,
        metadataRev: 3,
        turnCount: 1,
        updatedAt: "2026-06-19T00:00:00.000Z",
        lastEntryPreview: null,
      },
      idempotencyKey: "idem-sync",
    });

    expect(result).toBe("pushed");
    expect(transport.put).toHaveBeenCalledWith(
      "/v1/tales/remote-tale/package",
      expect.objectContaining({
        baseContentRev: 2,
        confirmReplace: true,
        package: expect.objectContaining({
          turns: expect.arrayContaining([expect.objectContaining({ seq: 1 })]),
        }),
      }),
      { idempotencyKey: "idem-sync" },
    );
    expect(transport.patch).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
  });

  it("bootstraps hosted sync through capabilities, auth, account, and device registration", async () => {
    http.fetch
      .mockResolvedValueOnce(jsonResponse({ cloudSaveProtocol: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({
          provider: "logto",
          issuer: "https://auth.example",
          audience: "hakawati",
          clientId: "client",
          scopes: ["openid"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "account-1",
          emailNormalized: "user@example.com",
          displayName: null,
          avatarUrl: null,
          createdAt: "2026-06-19T00:00:00.000Z",
          updatedAt: "2026-06-19T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "device-1",
          name: "Laptop",
          platform: "windows",
          appVersion: "0.15.0",
          createdAt: "2026-06-19T00:00:00.000Z",
          lastSeenAt: "2026-06-19T00:00:00.000Z",
        }),
      );

    const result = await prepareHostedSync({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      accessToken: "token",
      device: {
        name: "Laptop",
        platform: "windows",
        appVersion: "0.15.0",
      },
      getDeviceIdForAccount: vi.fn(() => "device-1"),
    });

    expect(result.account.id).toBe("account-1");
    expect(result.device?.id).toBe("device-1");
    expect(syncRepo.upsertSyncProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cloud",
        deviceId: "device-1",
      }),
    );
    expect(http.fetch).toHaveBeenNthCalledWith(
      4,
      "https://sync.example/v1/devices/current",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "X-Hakawati-Device-Id": "device-1",
        }),
        body: JSON.stringify({
          clientDeviceId: "device-1",
          name: "Laptop",
          platform: "windows",
          appVersion: "0.15.0",
        }),
      }),
    );
  });

  it("keeps hosted account signed in but disables sync when device limit is reached", async () => {
    http.fetch
      .mockResolvedValueOnce(jsonResponse({ cloudSaveProtocol: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({
          provider: "logto",
          issuer: "https://auth.example",
          audience: "hakawati",
          clientId: "client",
          scopes: ["openid"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "account-1",
          emailNormalized: "user@example.com",
          displayName: null,
          avatarUrl: null,
          createdAt: "2026-06-19T00:00:00.000Z",
          updatedAt: "2026-06-19T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Device limit reached"),
      });

    const result = await prepareHostedSync({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      accessToken: "token",
      device: {
        name: "Laptop",
        platform: "windows",
        appVersion: "0.15.0",
      },
      getDeviceIdForAccount: vi.fn(() => "device-1"),
    });

    expect(result.account.id).toBe("account-1");
    expect(result.device).toBeNull();
    expect(syncRepo.setSyncProfileDisabled).toHaveBeenCalledWith(
      "cloud",
      "device_limit",
    );
  });

  it("signs in with PKCE through the loopback callback", async () => {
    http.fetch
      .mockResolvedValueOnce(jsonResponse({ cloudSaveProtocol: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({
          provider: "logto",
          issuer: "https://auth.example/oidc",
          audience: "hakawati",
          clientId: "client",
          scopes: ["openid", "profile"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://auth.example/authorize",
          token_endpoint: "https://auth.example/token",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "access-token",
          expires_in: 3600,
          refresh_token: "refresh-token",
          token_type: "Bearer",
        }),
      );
    tauriCore.invoke
      .mockResolvedValueOnce({
        id: "oauth-123",
        redirectUri: "http://127.0.0.1:1234/callback",
      })
      .mockImplementationOnce(async () => {
        const openedUrl = new URL(String(opener.openUrl.mock.calls[0][0]));
        return `http://127.0.0.1:1234/callback?code=abc&state=${openedUrl.searchParams.get("state")}`;
      });

    const result = await signInHostedSync({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
    });

    expect(result.accessToken).toBe("access-token");
    expect(result.expiresIn).toBe(3600);
    expect(result.refreshToken).toBe("refresh-token");
    expect(opener.openUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: expect.any(URLSearchParams),
      }),
    );
    expect(http.fetch).toHaveBeenLastCalledWith(
      "https://auth.example/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    const tokenBody = new URLSearchParams(
      String(http.fetch.mock.calls.at(-1)?.[1]?.body),
    );
    expect(tokenBody.get("resource")).toBe("hakawati");
    const openedUrl = new URL(String(opener.openUrl.mock.calls[0][0]));
    expect(openedUrl.searchParams.get("scope")).toBe(
      "openid profile offline_access",
    );
    expect(openedUrl.searchParams.get("prompt")).toBe("consent");
  });

  it("refreshes hosted tokens without opening the browser", async () => {
    http.fetch
      .mockResolvedValueOnce(jsonResponse({ cloudSaveProtocol: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({
          provider: "logto",
          issuer: "https://auth.example/oidc",
          audience: "hakawati",
          clientId: "client",
          scopes: ["openid", "profile"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          token_endpoint: "https://auth.example/token",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "new-access-token",
          expires_in: 3600,
          refresh_token: "new-refresh-token",
          token_type: "Bearer",
        }),
      );

    const result = await refreshHostedSync({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      refreshToken: "refresh-token",
    });

    expect(opener.openUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      accessToken: "new-access-token",
      expiresIn: 3600,
      refreshToken: "new-refresh-token",
    });
    const tokenBody = new URLSearchParams(
      String(http.fetch.mock.calls.at(-1)?.[1]?.body),
    );
    expect(tokenBody.get("grant_type")).toBe("refresh_token");
    expect(tokenBody.get("refresh_token")).toBe("refresh-token");
    expect(tokenBody.get("resource")).toBe("hakawati");
  });

  it("surfaces OIDC token exchange errors", async () => {
    http.fetch
      .mockResolvedValueOnce(jsonResponse({ cloudSaveProtocol: 1 }))
      .mockResolvedValueOnce(
        jsonResponse({
          provider: "logto",
          issuer: "https://auth.example/oidc",
          audience: "hakawati",
          clientId: "client",
          scopes: ["openid", "profile"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_endpoint: "https://auth.example/authorize",
          token_endpoint: "https://auth.example/token",
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: "invalid_grant",
            error_description: "Code verifier did not match",
          }),
      });
    tauriCore.invoke
      .mockResolvedValueOnce({
        id: "oauth-123",
        redirectUri: "http://127.0.0.1:1234/callback",
      })
      .mockImplementationOnce(async () => {
        const openedUrl = new URL(String(opener.openUrl.mock.calls[0][0]));
        return `http://127.0.0.1:1234/callback?code=abc&state=${openedUrl.searchParams.get("state")}`;
      });

    await expect(
      signInHostedSync({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
      }),
    ).rejects.toThrow("Code verifier did not match");
  });

  it("updates the hosted account profile", async () => {
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn().mockResolvedValue({
        id: "account-1",
        emailNormalized: "player@example.com",
        displayName: "Player",
        avatarUrl: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      delete: vi.fn(),
    };

    const account = await updateHostedAccountProfile(transport, {
      displayName: "Player",
    });

    expect(transport.patch).toHaveBeenCalledWith("/v1/accounts/me", {
      displayName: "Player",
    });
    expect(account.displayName).toBe("Player");
  });

  it("fetches hosted account usage", async () => {
    const transport = {
      get: vi.fn().mockResolvedValue({
        tales: { used: 2, limit: 25 },
        storage: { usedBytes: 1024, limitBytes: 50 * 1024 * 1024 },
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(fetchHostedAccountUsage(transport)).resolves.toEqual({
      tales: { used: 2, limit: 25 },
      storage: { usedBytes: 1024, limitBytes: 50 * 1024 * 1024 },
    });
    expect(transport.get).toHaveBeenCalledWith("/v1/accounts/me/usage");
  });

  it("lists hosted devices", async () => {
    const devices = [
      {
        id: "device-1",
        name: "Laptop",
        platform: "windows",
        appVersion: "0.15.2",
        createdAt: "2026-06-21T00:00:00.000Z",
        lastSeenAt: "2026-06-22T00:00:00.000Z",
      },
    ];
    const transport = {
      get: vi.fn().mockResolvedValue(devices),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(listHostedDevices(transport)).resolves.toEqual(devices);
    expect(transport.get).toHaveBeenCalledWith("/v1/devices");
  });

  it("registers the current hosted device", async () => {
    const device = {
      id: "device-1",
      name: "Laptop",
      platform: "windows",
      appVersion: "0.15.2",
      createdAt: "2026-06-21T00:00:00.000Z",
      lastSeenAt: "2026-06-22T00:00:00.000Z",
    };
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn().mockResolvedValue(device),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      registerSyncDevice(transport, {
        id: "device-1",
        name: "Laptop",
        platform: "windows",
        appVersion: "0.15.2",
      }),
    ).resolves.toEqual(device);
    expect(transport.put).toHaveBeenCalledWith("/v1/devices/current", {
      clientDeviceId: "device-1",
      name: "Laptop",
      platform: "windows",
      appVersion: "0.15.2",
    });
  });

  it("unregisters a hosted device", async () => {
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn().mockResolvedValue(null),
    };

    await unregisterHostedDevice(transport, "device/2");

    expect(transport.delete).toHaveBeenCalledWith("/v1/devices/device%2F2");
  });

  it("imports a remote tale package and links local sync state", async () => {
    taleRepo.importTalePackage.mockResolvedValueOnce("local-imported");
    const transport = {
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 4,
        metadataRev: 5,
        turnCount: 1,
        package: {
          ...samplePackage(),
          assets: undefined,
        },
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    const localTaleId = await importRemoteTalePackage({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      remoteTaleId: "remote-tale",
    });

    expect(localTaleId).toBe("local-imported");
    expect(taleRepo.importTalePackage).toHaveBeenCalledWith(
      expect.objectContaining({ format: "hakawati-tale-package" }),
      { preserveId: true },
    );
    const importedPackage = taleRepo.importTalePackage.mock.calls[0][0];
    expect(importedPackage.assets).toEqual([]);
    expect(importedPackage.tale.thumbnailAssetId).toBeUndefined();
    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        localTaleId: "local-imported",
        remoteTaleId: "remote-tale",
        contentRev: "4",
        metadataRev: "5",
        pendingStatus: "idle",
      }),
    );
  });

  it("keeps both by copying the local tale, uploading it, and restoring the original remote branch", async () => {
    taleRepo.exportTalePackage
      .mockResolvedValueOnce(samplePackage())
      .mockResolvedValueOnce({
        ...samplePackage(),
        tale: { ...samplePackage().tale, id: "local-copy" },
      });
    taleRepo.importTalePackage.mockResolvedValueOnce("local-copy");
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "conflict",
      lastErrorCode: "content_conflict",
    });
    const transport = {
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 8,
        metadataRev: 9,
        turnCount: 1,
        package: toSyncTalePackage(samplePackage(), { mode: "hosted" }),
      }),
      post: vi.fn().mockResolvedValue({
        id: "local-copy",
        contentRev: 1,
        metadataRev: 1,
      }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    const copyId = await keepBothTalePackage({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
      idempotencyKey: "idem-copy",
    });

    expect(copyId).toBe("local-copy");
    expect(taleRepo.importTalePackage).toHaveBeenCalledWith(
      expect.objectContaining({ format: "hakawati-tale-package" }),
      { title: "Local Tale (copy)" },
    );
    expect(transport.post).toHaveBeenCalledWith(
      "/v1/tales",
      expect.any(Object),
      { idempotencyKey: "idem-copy" },
    );
    expect(taleRepo.replaceTaleWithPackage).toHaveBeenCalledWith(
      "local-tale",
      expect.objectContaining({ format: "hakawati-tale-package" }),
    );
    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "8",
        metadataRev: "9",
        pendingStatus: "idle",
      }),
    );
  });

  it("uses remote by replacing the linked local tale and updating sync state", async () => {
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "conflict",
      lastErrorCode: "content_conflict",
    });
    const remotePackage = {
      ...samplePackage(),
      assets: undefined,
    };
    const transport = {
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 8,
        metadataRev: 9,
        turnCount: 1,
        package: remotePackage,
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await applyRemoteTalePackage({
      profile: {
        id: "cloud",
        baseUrl: "https://sync.example",
        mode: "hosted",
      },
      transport,
      localTaleId: "local-tale",
    });

    expect(taleRepo.replaceTaleWithPackage).toHaveBeenCalledWith(
      "local-tale",
      expect.objectContaining({ format: "hakawati-tale-package" }),
    );
    const replacementPackage = taleRepo.replaceTaleWithPackage.mock.calls[0][1];
    expect(replacementPackage.assets).toEqual([]);
    expect(replacementPackage.tale.thumbnailAssetId).toBeUndefined();
    expect(syncRepo.upsertTaleSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "8",
        metadataRev: "9",
        pendingStatus: "idle",
        lastErrorCode: null,
      }),
    );
  });
});
