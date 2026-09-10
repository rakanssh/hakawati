import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode } from "@/types/context.type";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import type { TalePackageV1 } from "@/types/export.type";
import {
  canUploadCoverAssets,
  assertSyncAvailable,
  createSyncTransport,
  deleteRemoteTale,
  fetchHostedAccountUsage,
  importRemoteTalePackage,
  keepBothTalePackage,
  listHostedDevices,
  prepareHostedSync,
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
  type SyncCapabilities,
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
  getTaleSaveVersion: vi.fn(async () => 1),
  importTalePackage: vi.fn(),
  replaceTaleWithPackage: vi.fn(
    async (
      _taleId: string,
      _pkg: TalePackageV1,
      _options?: { expectedSaveVersion?: number },
    ) => true,
  ),
}));

const syncRepo = vi.hoisted(() => ({
  getTaleSyncState: vi.fn(),
  setSyncProfileDisabled: vi.fn(),
  setTaleSyncStatus: vi.fn(),
  upsertSyncProfile: vi.fn(),
  upsertTaleSyncState: vi.fn(),
  upsertTaleSyncStateIfTaleVersion: vi.fn(async () => true),
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
  getTaleSaveVersion: taleRepo.getTaleSaveVersion,
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
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send requests or accept late responses after its session is aborted", async () => {
    const controller = new AbortController();
    let finishResponse!: (body: string) => void;
    http.fetch.mockResolvedValue({
      ok: true,
      text: () =>
        new Promise<string>((resolve) => {
          finishResponse = resolve;
        }),
    });
    const transport = createSyncTransport({
      profile: { id: "cloud", mode: "hosted", baseUrl: "https://sync.example" },
      accessToken: "old-session",
      signal: controller.signal,
    });
    const pending = transport.get("/v1/tales");
    await Promise.resolve();
    controller.abort();
    finishResponse('{"items":[]}');
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(transport.post("/v1/tales", {})).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(http.fetch).toHaveBeenCalledOnce();
  });

  it("refuses an unsupported cloud-save protocol even when sync is advertised available", () => {
    expect(() =>
      assertSyncAvailable({ ...capabilitiesFixture(), cloudSaveProtocol: 2 }),
    ).toThrow(/unavailable/);
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
          "X-Hakawati-Api-Version": "1",
          "X-Hakawati-Client-Version": "0.15.2",
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
          "X-Hakawati-Api-Version": "1",
          "X-Hakawati-Client-Version": "0.15.2",
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
      capabilities: capabilitiesFixture(),
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

  it("uses the explicit cover-storage capability for hosted uploads", () => {
    expect(canUploadCoverAssets(capabilitiesFixture())).toBe(true);
  });

  it.each(["unchanged", "changed", "absent"])(
    "preserves existing covers and uploads changed bytes: %s",
    async (thumbnail) => {
      const pkg = samplePackage();
      const bytes = Uint8Array.from(
        atob(pkg.assets[0].dataBase64),
        (character) => character.charCodeAt(0),
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const existingCover = {
        assetId: "existing-cover",
        visibility: "private" as const,
        contentType: "image/png",
        byteSize: bytes.length,
        sha256: Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
        width: null,
        height: null,
        downloadUrl: "/v1/assets/existing-cover/download",
        urlExpiresAt: null,
      };
      const changed = thumbnail === "changed";
      if (changed) pkg.assets[0].dataBase64 = btoa("changed bytes");
      if (thumbnail === "absent") {
        pkg.assets = [];
        delete pkg.tale.thumbnailAssetId;
      }
      taleRepo.exportTalePackage.mockResolvedValue(pkg);
      syncRepo.getTaleSyncState.mockResolvedValue({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "push",
        lastErrorCode: null,
      });
      http.fetch.mockResolvedValue({ ok: true });
      const transport = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          asset: { assetId: "new-cover" },
          upload: {
            url: "https://storage.example/new-cover",
            method: "PUT",
            headers: {},
          },
        }),
        put: vi.fn().mockResolvedValue({
          id: "remote-tale",
          contentRev: 3,
          metadataRev: 4,
        }),
        patch: vi.fn(),
        delete: vi.fn(),
      };
      await syncLinkedTale({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        remoteTale: {
          id: "remote-tale",
          sourceTaleId: "local-tale",
          title: "Local Tale",
          description: pkg.tale.description,
          gameMode: GameMode.STORY_TELLER,
          coverAssetId: "existing-cover",
          thumbnailAssetId: "existing-cover",
          cover: existingCover,
          contentRev: 2,
          metadataRev: 3,
          turnCount: 1,
          updatedAt: "2026-09-10",
          lastEntryPreview: null,
        },
        idempotencyKey: "cover-replace",
        capabilities: capabilitiesFixture(),
      });
      expect(transport.post).toHaveBeenCalledTimes(changed ? 2 : 0);
      expect(http.fetch).toHaveBeenCalledTimes(changed ? 1 : 0);
      expect(transport.put.mock.calls[0][1].package.tale.coverAssetId).toBe(
        changed ? "new-cover" : "existing-cover",
      );
    },
  );

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
      capabilities: capabilitiesFixture("unavailable"),
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
      capabilities: capabilitiesFixture("unavailable"),
    });

    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentRev: "7",
        metadataRev: "9",
        pendingStatus: "idle",
      }),
      1,
    );
  });

  it("keeps a successful initial upload linked and pending when the local tale changes", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.upsertTaleSyncStateIfTaleVersion.mockResolvedValueOnce(false);
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        id: "generated-remote-tale",
        sourceTaleId: "local-tale",
        contentRev: 2,
        metadataRev: 3,
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
      idempotencyKey: "idem-version-race",
      capabilities: capabilitiesFixture("unavailable"),
    });

    expect(syncRepo.upsertTaleSyncState).toHaveBeenCalledWith({
      profileId: "cloud",
      accountId: undefined,
      localTaleId: "local-tale",
      remoteTaleId: "generated-remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: null,
      pendingStatus: "push",
      lastErrorCode: null,
    });
  });

  it("rejects a successful create response without a remote tale id", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        sourceTaleId: "local-tale",
        contentRev: 1,
        metadataRev: 1,
      }),
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
        idempotencyKey: "idem-invalid-create",
        capabilities: capabilitiesFixture("unavailable"),
      }),
    ).rejects.toMatchObject({ code: "invalid_create_response" });

    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).not.toHaveBeenCalled();
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
            "device_not_registered",
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
        capabilities: capabilitiesFixture(),
      }),
    ).rejects.toThrow("Register this device before using cloud saves");

    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).not.toHaveBeenCalled();
    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "cloud",
      localTaleId: "local-tale",
      pendingStatus: "error",
      lastErrorCode: "device_not_registered",
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
      capabilities: capabilitiesFixture("unavailable"),
    });

    expect(transport.put).toHaveBeenCalledWith(
      "/v1/tales/remote-tale/package",
      expect.objectContaining({
        baseContentRev: 12,
        confirmReplace: true,
      }),
      { idempotencyKey: "idem-replace" },
    );
    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        remoteTaleId: "remote-tale",
        contentRev: "13",
        metadataRev: "4",
        pendingStatus: "idle",
        lastErrorCode: null,
      }),
      1,
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
      capabilities: capabilitiesFixture("unavailable"),
    });

    const [, body] = transport.put.mock.calls[0];
    expect(body).toMatchObject({
      confirmReplace: true,
      package: expect.any(Object),
    });
    expect(body).not.toHaveProperty("baseContentRev");
  });

  it.each([false, true])(
    "records replacement failures only for the current session: %s",
    async (cancelled) => {
      const controller = new AbortController();
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
        signal: controller.signal,
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn().mockImplementation(async () => {
          if (cancelled) controller.abort(new Error("cancelled"));
          throw new Error("offline");
        }),
        patch: vi.fn(),
        delete: vi.fn(),
      };

      await expect(
        replaceRemoteTalePackage({
          profile: {
            id: "cloud",
            baseUrl: "https://sync.example",
            mode: "hosted",
          },
          transport,
          localTaleId: "local-tale",
          capabilities: capabilitiesFixture("unavailable"),
          idempotencyKey: "idem-content",
        }),
      ).rejects.toThrow(cancelled ? "cancelled" : "offline");
      if (cancelled) {
        expect(syncRepo.setTaleSyncStatus).not.toHaveBeenCalled();
        return;
      }

      expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
        profileId: "cloud",
        localTaleId: "local-tale",
        pendingStatus: "error",
        lastErrorCode: "sync_failed",
      });
    },
  );

  it("marks package replacement revision conflicts explicitly", async () => {
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
      put: vi
        .fn()
        .mockRejectedValue(
          new SyncHttpError("Conflict", 409, "content_conflict"),
        ),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      replaceRemoteTalePackage({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        capabilities: capabilitiesFixture("unavailable"),
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

  it("detects when a listed remote tale has newer revisions", () => {
    const state = {
      remoteTaleId: "remote-tale",
      contentRev: "7",
      metadataRev: "9",
    };
    const remote = {
      id: "remote-tale",
      sourceTaleId: "local-tale",
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
        sourceTaleId: "local-tale",
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
      capabilities: capabilitiesFixture("unavailable"),
    });

    expect(result).toBe("pulled");
    expect(taleRepo.replaceTaleWithPackage).toHaveBeenCalledWith(
      "local-tale",
      expect.objectContaining({
        format: "hakawati-tale-package",
      }),
      { expectedSaveVersion: 1 },
    );
    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentRev: "4",
        metadataRev: "3",
        pendingStatus: "idle",
      }),
      2,
    );
  });

  it("does not overwrite a local save made while a remote pull is downloading", async () => {
    syncRepo.getTaleSyncState.mockResolvedValue({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "idle",
      lastErrorCode: null,
    });
    taleRepo.replaceTaleWithPackage.mockResolvedValueOnce(false);
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
        sourceTaleId: "local-tale",
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
      capabilities: capabilitiesFixture("unavailable"),
    });

    expect(result).toBe("conflict");
    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith({
      profileId: "cloud",
      accountId: undefined,
      localTaleId: "local-tale",
      pendingStatus: "conflict",
      lastErrorCode: "local_changed",
    });
    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).not.toHaveBeenCalled();
  });

  it("retains a failed automatic download as pull work guarded against local edits", async () => {
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
          sourceTaleId: "local-tale",
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

    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "cloud",
        localTaleId: "local-tale",
        pendingStatus: "pull",
        lastErrorCode: "auth",
      }),
      1,
    );
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
        sourceTaleId: "local-tale",
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

  it.each(["edit", "append", "state", "metadata"])(
    "replaces dirty packages in one write without intermediate acknowledgement: %s",
    async (change) => {
      const appended = change === "append";
      const pkg = samplePackage();
      if (change === "edit" || appended)
        pkg.turns[0].entries[0].text = "Edited an existing turn while offline.";
      if (change === "state")
        pkg.state.data.gm.scratchpad = { note: "updated state" };
      if (change === "metadata") pkg.tale.title = "Renamed while offline";
      if (appended)
        pkg.turns.push({
          ...pkg.turns[0],
          id: "turn-2",
          seq: 2,
          entries: [
            { ...pkg.turns[0].entries[0], id: "entry-2", text: "New turn." },
          ],
        });
      taleRepo.exportTalePackage.mockResolvedValue(pkg);
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
          sourceTaleId: "local-tale",
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
        capabilities: capabilitiesFixture("unavailable"),
      });

      expect(result).toBe("pushed");
      expect(transport.put).toHaveBeenCalledWith(
        "/v1/tales/remote-tale/package",
        expect.objectContaining({
          baseContentRev: 2,
          baseMetadataRev: 3,
          confirmReplace: true,
          package: expect.objectContaining({
            turns: expect.arrayContaining([
              expect.objectContaining({ seq: 1 }),
            ]),
          }),
        }),
        { idempotencyKey: "idem-sync" },
      );
      expect(transport.patch).not.toHaveBeenCalled();
      expect(transport.post).not.toHaveBeenCalled();
      const uploaded = transport.put.mock.calls[0][1].package;
      expect(uploaded.turns).toHaveLength(appended ? 2 : 1);
      expect(uploaded.turns[0].entries[0].text).toBe(
        pkg.turns[0].entries[0].text,
      );
      expect(uploaded.tale.title).toBe(pkg.tale.title);
      expect(uploaded.state).toEqual(
        toSyncTalePackage(pkg, { mode: "hosted" }).state,
      );
      expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenCalledOnce();
      expect(transport.put.mock.invocationCallOrder[0]).toBeLessThan(
        syncRepo.upsertTaleSyncStateIfTaleVersion.mock.invocationCallOrder[0],
      );
    },
  );

  it("does not pull over an edit made after the background idle-state check", async () => {
    const state = {
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "idle",
      lastErrorCode: null,
    };
    syncRepo.getTaleSyncState
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({ ...state, pendingStatus: "push" });
    const transport = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const result = await syncLinkedTale({
      profile: { id: "cloud", baseUrl: "https://sync.example", mode: "hosted" },
      transport,
      localTaleId: "local-tale",
      remoteTale: {
        id: "remote-tale",
        sourceTaleId: "local-tale",
        title: "Remote",
        description: null,
        gameMode: GameMode.STORY_TELLER,
        coverAssetId: null,
        thumbnailAssetId: null,
        contentRev: 3,
        metadataRev: 3,
        turnCount: 1,
        updatedAt: "2026-09-10",
        lastEntryPreview: null,
      },
      idempotencyKey: "idle-pull",
    });
    expect(result).toBe("conflict");
    expect(transport.get).not.toHaveBeenCalled();
    expect(taleRepo.replaceTaleWithPackage).not.toHaveBeenCalled();
    expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingStatus: "conflict",
        lastErrorCode: "local_changed",
      }),
    );
  });

  it("retries failed downloads as pull work without treating them as local edits", async () => {
    syncRepo.getTaleSyncState.mockResolvedValue({
      profileId: "cloud",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "2",
      metadataRev: "3",
      lastSyncedAt: 1,
      pendingStatus: "pull",
      lastErrorCode: "sync_failed",
    });
    const transport = {
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 3,
        metadataRev: 3,
        package: toSyncTalePackage(samplePackage(), { mode: "hosted" }),
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    expect(
      await applyRemoteTalePackage({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        requireClean: true,
      }),
    ).toBe(true);
    expect(taleRepo.replaceTaleWithPackage).toHaveBeenCalledOnce();
    expect(syncRepo.setTaleSyncStatus).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "reconciles a lost write response using wire content, preserving newer local edits: %s",
    async (newerLocalEdit) => {
      const pkg = samplePackage();
      pkg.tale.source = {
        type: "catalog",
        scenarioId: "scenario",
        scenarioVersionId: "version",
        scenarioTitle: "Gate",
      };
      const remotePackage = toSyncTalePackage(structuredClone(pkg), {
        mode: "hosted",
      });
      if (newerLocalEdit) pkg.turns[0].entries[0].text = "A newer local edit";
      taleRepo.exportTalePackage.mockResolvedValue(pkg);
      syncRepo.getTaleSyncState.mockResolvedValue({
        profileId: "cloud",
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "2",
        metadataRev: "3",
        lastSyncedAt: 1,
        pendingStatus: "error",
        lastErrorCode: "sync_failed",
      });
      const transport = {
        get: vi.fn().mockResolvedValue({
          id: "remote-tale",
          contentRev: 3,
          metadataRev: 4,
          package: remotePackage,
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
          sourceTaleId: "local-tale",
          title: pkg.tale.title,
          description: pkg.tale.description,
          gameMode: GameMode.STORY_TELLER,
          coverAssetId: null,
          thumbnailAssetId: null,
          contentRev: 3,
          metadataRev: 4,
          turnCount: 1,
          updatedAt: "2026-09-10",
          lastEntryPreview: null,
        },
        idempotencyKey: "ambiguous-write",
      });
      expect(result).toBe(newerLocalEdit ? "conflict" : "pushed");
      expect(transport.put).not.toHaveBeenCalled();
      expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenCalledTimes(
        newerLocalEdit ? 0 : 1,
      );
      expect(taleRepo.replaceTaleWithPackage).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "bootstraps hosted sync and rejects late registration after signout: %s",
    async (cancelled) => {
      const controller = new AbortController();
      http.fetch
        .mockResolvedValueOnce(jsonResponse(capabilitiesFixture()))
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
        .mockImplementationOnce(async () => {
          if (cancelled) controller.abort();
          return jsonResponse({
            id: "device-1",
            name: "Laptop",
            platform: "windows",
            appVersion: "0.15.0",
            createdAt: "2026-06-19T00:00:00.000Z",
            lastSeenAt: "2026-06-19T00:00:00.000Z",
          });
        });

      const preparation = prepareHostedSync({
        signal: controller.signal,
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

      if (cancelled) {
        await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
        expect(syncRepo.upsertSyncProfile).not.toHaveBeenCalledWith(
          expect.objectContaining({ enabled: true }),
        );
        return;
      }
      const result = await preparation;
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
    },
  );

  it("keeps hosted account signed in but disables sync when device limit is reached", async () => {
    http.fetch
      .mockResolvedValueOnce(jsonResponse(capabilitiesFixture()))
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
        text: () =>
          Promise.resolve(
            JSON.stringify({
              code: "device_limit_exceeded",
              message: "Device limit reached",
            }),
          ),
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

  it.each([false, true])(
    "honors PKCE cancellation even during the final token exchange: %s",
    async (cancelDuringExchange) => {
      const controller = new AbortController();
      const exchangedTokens = {
        access_token: "access-token",
        expires_in: 3600,
        refresh_token: "refresh-token",
        token_type: "Bearer",
      };
      http.fetch
        .mockResolvedValueOnce(jsonResponse(capabilitiesFixture()))
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
          ...jsonResponse(exchangedTokens),
          json: async () => {
            if (cancelDuringExchange) controller.abort();
            return exchangedTokens;
          },
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

      const pending = signInHostedSync({
        signal: controller.signal,
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
      });

      if (cancelDuringExchange) {
        await expect(pending).rejects.toMatchObject({
          name: "HostedSignInCancelledError",
        });
        return;
      }
      const result = await pending;

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
    },
  );

  it("refreshes hosted tokens without opening the browser", async () => {
    http.fetch
      .mockResolvedValueOnce(jsonResponse(capabilitiesFixture()))
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
      .mockResolvedValueOnce(jsonResponse(capabilitiesFixture()))
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
      capabilities: capabilitiesFixture("unavailable"),
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
      { expectedSaveVersion: 1 },
    );
    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "8",
        metadataRev: "9",
        pendingStatus: "idle",
      }),
      2,
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
      { expectedSaveVersion: 1 },
    );
    const replacementPackage = taleRepo.replaceTaleWithPackage.mock.calls[0][1];
    expect(replacementPackage.assets).toEqual([]);
    expect(replacementPackage.tale.thumbnailAssetId).toBeUndefined();
    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        localTaleId: "local-tale",
        remoteTaleId: "remote-tale",
        contentRev: "8",
        metadataRev: "9",
        pendingStatus: "idle",
        lastErrorCode: null,
      }),
      2,
    );
  });
});

function capabilitiesFixture(
  coverStorage: "available" | "unavailable" = "available",
): SyncCapabilities {
  return {
    server: "hakawati-cloud",
    apiVersion: "1",
    minimumClientVersion: "0.15.2",
    compatibility: { state: "compatible" },
    cloudSaveProtocol: 1,
    features: {
      sync: { state: "available" },
      catalogRead: { state: "available" },
      coverStorage: { state: coverStorage },
      publishing: { state: "available" },
    },
    limits: {
      maxPackageBytes: 1024,
      maxStateBytes: 1024,
    },
    scenarioCatalog: {
      packageFormatVersion: 1,
      thumbnailUploads:
        coverStorage === "available" ? "enabled" : "storage-not-configured",
    },
  };
}
