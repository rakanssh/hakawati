import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode } from "@/types/context.type";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import type { TalePackageV1 } from "@/types/export.type";
import type { TaleSyncState } from "@/repositories/sync.repository";
import { useTaleStore } from "@/store/useTaleStore";
import {
  assertSyncAvailable,
  createSyncTransport,
  deleteRemoteTale,
  importRemoteTalePackage,
  keepBothTalePackage,
  listAllRemoteTales,
  prepareHostedSync,
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

const coverImages = vi.hoisted(() => ({ optimize: vi.fn() }));

vi.mock("@/lib/cover-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cover-image")>()),
  optimizeCoverImage: coverImages.optimize,
}));

const taleRepo = vi.hoisted(() => ({
  exportTalePackage: vi.fn(),
  getTaleSaveVersion: vi.fn(async () => 1),
  importTalePackage: vi.fn(),
  replaceTaleWithPackage: vi.fn(
    async (
      _taleId: string,
      _pkg: TalePackageV1,
      options?: { expectedSaveVersion?: number; canReplace?: () => boolean },
    ) => options?.canReplace?.() !== false,
  ),
}));

const syncRepo = vi.hoisted(() => ({
  acknowledgeTaleSyncWrite: vi.fn(),
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
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

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

function transportFixture() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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
    coverImages.optimize.mockImplementation(
      async (input: { bytes: Uint8Array; contentType: string }) => ({
        ...input,
        width: 1,
        height: 1,
      }),
    );
    useTaleStore.setState({ id: "other-tale", loadingTaleId: null });
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

  it.each([
    ["code", "content_conflict"],
    ["type", "metadata_conflict"],
  ])("reports HTTP status and the server's %s error", async (field, code) => {
    http.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ [field]: code, message: "Conflict" }),
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
      code,
    } satisfies Partial<SyncHttpError>);
  });

  it("lists every remote page and encodes its cursor", async () => {
    const transport = transportFixture();
    transport.get
      .mockResolvedValueOnce({
        items: [{ id: "first" }],
        nextCursor: "next/page+2",
      })
      .mockResolvedValueOnce({ items: [{ id: "second" }], nextCursor: null });

    await expect(listAllRemoteTales(transport, 1)).resolves.toEqual([
      { id: "first" },
      { id: "second" },
    ]);
    expect(transport.get.mock.calls).toEqual([
      ["/v1/tales?limit=1"],
      ["/v1/tales?cursor=next%2Fpage%2B2&limit=1"],
    ]);
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
      ...transportFixture(),
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
    expect(syncRepo.upsertTaleSyncStateIfTaleVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        remoteTaleId: "remote-tale",
        contentRev: "7",
        metadataRev: "9",
        pendingStatus: "idle",
      }),
      1,
    );
  });

  it.each(["unchanged", "changed", "absent", "optimized"])(
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
      if (thumbnail === "optimized") {
        const optimizedBytes = new Uint8Array([21, 22]);
        const optimizedDigest = await crypto.subtle.digest(
          "SHA-256",
          optimizedBytes,
        );
        existingCover.contentType = "image/webp";
        existingCover.byteSize = optimizedBytes.byteLength;
        existingCover.sha256 = Array.from(new Uint8Array(optimizedDigest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        coverImages.optimize.mockResolvedValue({
          bytes: optimizedBytes,
          contentType: "image/webp",
          width: 1280,
          height: 720,
        });
      }
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
        ...transportFixture(),
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
      expect(coverImages.optimize).toHaveBeenCalledTimes(
        changed || thumbnail === "optimized" ? 1 : 0,
      );
    },
  );

  it("uploads the optimized cover bytes and metadata without changing the local original", async () => {
    const pkg = samplePackage();
    const original = structuredClone(pkg);
    const optimizedBytes = new Uint8Array([31, 32]);
    const digest = await crypto.subtle.digest("SHA-256", optimizedBytes);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    coverImages.optimize.mockResolvedValue({
      bytes: optimizedBytes,
      contentType: "image/webp",
      width: 720,
      height: 1280,
    });
    taleRepo.exportTalePackage.mockResolvedValue(pkg);
    http.fetch.mockResolvedValue({ ok: true });
    const transport = {
      ...transportFixture(),
      post: vi.fn(async (path: string) =>
        path === "/v1/assets/cover-upload-intents"
          ? {
              asset: { assetId: "optimized-cover" },
              upload: { url: "https://storage.example/optimized", headers: {} },
            }
          : { id: "remote-tale", contentRev: 1, metadataRev: 1 },
      ),
    };
    await uploadTalePackage({
      profile: { id: "cloud", baseUrl: "https://sync.example", mode: "hosted" },
      transport,
      localTaleId: "local-tale",
      idempotencyKey: "optimized-cover-upload",
      capabilities: capabilitiesFixture(),
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/assets/cover-upload-intents",
      {
        visibility: "private",
        contentType: "image/webp",
        byteSize: 2,
        sha256,
        width: 720,
        height: 1280,
      },
    );
    const body = http.fetch.mock.calls[0][1].body as Blob;
    expect(body.type).toBe("image/webp");
    expect(body.size).toBe(2);
    expect(pkg).toEqual(original);
  });

  it("does not create a cover upload after the sync session aborts during optimization", async () => {
    const controller = new AbortController();
    taleRepo.exportTalePackage.mockResolvedValue(samplePackage());
    coverImages.optimize.mockImplementation(async () => {
      controller.abort();
      return {
        bytes: new Uint8Array([31]),
        contentType: "image/webp",
        width: 1,
        height: 1,
      };
    });
    const transport = { ...transportFixture(), signal: controller.signal };
    await expect(
      uploadTalePackage({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        idempotencyKey: "aborted-cover-upload",
        capabilities: capabilitiesFixture(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(transport.post).not.toHaveBeenCalled();
    expect(http.fetch).not.toHaveBeenCalled();
  });

  it("uses the sync mapper for personal uploads instead of raw local export", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    const transport = {
      ...transportFixture(),
      post: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 7,
        metadataRev: 9,
      }),
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
    const transport = transportFixture();

    await deleteRemoteTale(transport, "remote-tale", 7);

    expect(transport.delete).toHaveBeenCalledWith(
      "/v1/tales/remote-tale?baseMetadataRev=7",
    );
  });

  it("keeps a successful initial upload linked and pending when the local tale changes", async () => {
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.upsertTaleSyncStateIfTaleVersion.mockResolvedValueOnce(false);
    const transport = {
      ...transportFixture(),
      post: vi.fn().mockResolvedValue({
        id: "generated-remote-tale",
        sourceTaleId: "local-tale",
        contentRev: 2,
        metadataRev: 3,
      }),
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
      ...transportFixture(),
      post: vi.fn().mockResolvedValue({
        sourceTaleId: "local-tale",
        contentRev: 1,
        metadataRev: 1,
      }),
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
      ...transportFixture(),
      post: vi
        .fn()
        .mockRejectedValue(
          new SyncHttpError(
            "Register this device before using cloud saves",
            403,
            "device_not_registered",
          ),
        ),
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
      ...transportFixture(),
      get: vi.fn().mockResolvedValue({ features: {} }),
      put: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 13,
        metadataRev: 4,
      }),
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
    expect(syncRepo.acknowledgeTaleSyncWrite).toHaveBeenLastCalledWith({
      expectedState: expect.objectContaining({
        remoteTaleId: "remote-tale",
        contentRev: "12",
        metadataRev: "3",
      }),
      expectedSaveVersion: 1,
      contentRev: "13",
      metadataRev: "4",
    });
  });

  it("acknowledges the uploaded snapshot and uses stored revisions for the next local edit", async () => {
    const pkg = samplePackage();
    const edited = structuredClone(pkg);
    edited.turns[0].entries[0].text = "Edited during upload.";
    const state: TaleSyncState = {
      profileId: "cloud",
      accountId: "account-a",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "1",
      metadataRev: "1",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    };
    syncRepo.getTaleSyncState.mockResolvedValue(state);
    taleRepo.exportTalePackage
      .mockResolvedValueOnce(pkg)
      .mockResolvedValueOnce(edited);
    const transport = transportFixture();
    transport.put
      .mockImplementationOnce(async () => {
        taleRepo.getTaleSaveVersion.mockResolvedValue(2);
        return { id: "remote-tale", contentRev: 2, metadataRev: 2 };
      })
      .mockResolvedValueOnce({
        id: "remote-tale",
        contentRev: 3,
        metadataRev: 3,
      });
    const input = {
      profile: {
        id: "cloud",
        accountId: "account-a",
        baseUrl: "https://sync.example",
        mode: "hosted" as const,
      },
      transport,
      localTaleId: "local-tale",
      remoteTale: {
        id: "remote-tale",
        sourceTaleId: "local-tale",
        title: pkg.tale.title,
        description: pkg.tale.description,
        gameMode: pkg.tale.gameMode,
        coverAssetId: null,
        thumbnailAssetId: null,
        contentRev: 1,
        metadataRev: 1,
        turnCount: 1,
        updatedAt: "2026-09-10",
        lastEntryPreview: null,
      },
      idempotencyKey: "first-snapshot",
      capabilities: capabilitiesFixture("unavailable"),
    };
    expect(await syncLinkedTale(input)).toBe("pushed");
    expect(syncRepo.acknowledgeTaleSyncWrite).toHaveBeenLastCalledWith({
      expectedState: state,
      expectedSaveVersion: 1,
      contentRev: "2",
      metadataRev: "2",
    });
    // SQLite tests cover this stored outcome when an edit races the upload.
    syncRepo.getTaleSyncState.mockResolvedValue({
      ...state,
      contentRev: "2",
      metadataRev: "2",
    });
    expect(
      await syncLinkedTale({
        ...input,
        remoteTale: { ...input.remoteTale, contentRev: 2, metadataRev: 2 },
        idempotencyKey: "next-snapshot",
      }),
    ).toBe("pushed");
    expect(transport.put).toHaveBeenCalledTimes(2);
    expect(transport.put.mock.calls[1][1]).toMatchObject({
      baseContentRev: 2,
      baseMetadataRev: 2,
      package: { turns: [{ entries: [{ text: "Edited during upload." }] }] },
    });
    expect(syncRepo.acknowledgeTaleSyncWrite).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedSaveVersion: 2,
        contentRev: "3",
        metadataRev: "3",
      }),
    );
    expect(syncRepo.setTaleSyncStatus).not.toHaveBeenCalled();
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
      ...transportFixture(),
      get: vi.fn().mockResolvedValue({ features: {} }),
      put: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 13,
        metadataRev: 4,
      }),
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

  it("does not acknowledge a replacement after its account session is cancelled", async () => {
    const controller = new AbortController();
    taleRepo.exportTalePackage.mockResolvedValueOnce(samplePackage());
    syncRepo.getTaleSyncState.mockResolvedValueOnce({
      profileId: "cloud",
      accountId: "old-account",
      localTaleId: "local-tale",
      remoteTaleId: "remote-tale",
      contentRev: "1",
      metadataRev: "1",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const transport = {
      ...transportFixture(),
      signal: controller.signal,
      put: vi.fn().mockImplementation(async () => {
        controller.abort(new Error("account changed"));
        return { id: "remote-tale", contentRev: 2, metadataRev: 2 };
      }),
    };
    await expect(
      replaceRemoteTalePackage({
        profile: {
          id: "cloud",
          accountId: "old-account",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        transport,
        localTaleId: "local-tale",
        idempotencyKey: "cancelled-replacement",
        capabilities: capabilitiesFixture("unavailable"),
      }),
    ).rejects.toThrow("account changed");
    expect(syncRepo.acknowledgeTaleSyncWrite).not.toHaveBeenCalled();
    expect(syncRepo.setTaleSyncStatus).not.toHaveBeenCalled();
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
        ...transportFixture(),
        signal: controller.signal,
        put: vi.fn().mockImplementation(async () => {
          if (cancelled) controller.abort(new Error("cancelled"));
          throw new Error("offline");
        }),
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
      ...transportFixture(),
      put: vi
        .fn()
        .mockRejectedValue(
          new SyncHttpError("Conflict", 409, "content_conflict"),
        ),
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

  it.each(["closed", "loaded", "loading", "opened-during-download"])(
    "handles automatic remote changes when the local tale is %s",
    async (openState) => {
      if (openState === "loaded") useTaleStore.setState({ id: "local-tale" });
      if (openState === "loading")
        useTaleStore.setState({ loadingTaleId: "local-tale" });
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
        ...transportFixture(),
        get: vi.fn().mockImplementation(async () => {
          if (openState === "opened-during-download") {
            useTaleStore.setState({ loadingTaleId: "local-tale" });
          }
          return {
            id: "remote-tale",
            contentRev: 4,
            metadataRev: 3,
            turnCount: 1,
            package: toSyncTalePackage(samplePackage(), { mode: "hosted" }),
          };
        }),
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
        canPull: () => {
          const active = useTaleStore.getState();
          return (
            active.id !== "local-tale" && active.loadingTaleId !== "local-tale"
          );
        },
        idempotencyKey: "idem-sync",
        capabilities: capabilitiesFixture("unavailable"),
      });

      if (openState !== "closed") {
        expect(result).toBe("conflict");
        expect(
          syncRepo.upsertTaleSyncStateIfTaleVersion,
        ).not.toHaveBeenCalled();
        expect(syncRepo.setTaleSyncStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            pendingStatus: "conflict",
            lastErrorCode: "local_changed",
          }),
        );
        if (openState !== "opened-during-download") {
          expect(transport.get).not.toHaveBeenCalled();
          expect(taleRepo.replaceTaleWithPackage).not.toHaveBeenCalled();
        }
        return;
      }
      expect(result).toBe("pulled");
      expect(taleRepo.replaceTaleWithPackage).toHaveBeenCalledWith(
        "local-tale",
        expect.objectContaining({
          format: "hakawati-tale-package",
        }),
        { expectedSaveVersion: 1, canReplace: expect.any(Function) },
      );
      expect(
        syncRepo.upsertTaleSyncStateIfTaleVersion,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentRev: "4",
          metadataRev: "3",
          pendingStatus: "idle",
        }),
        2,
      );
    },
  );

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
      ...transportFixture(),
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 4,
        metadataRev: 3,
        turnCount: 1,
        package: toSyncTalePackage(samplePackage(), { mode: "hosted" }),
      }),
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
      ...transportFixture(),
      get: vi
        .fn()
        .mockRejectedValue(new SyncHttpError("Unauthorized", 401, "auth")),
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
    const transport = transportFixture();

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

  it("uploads offline edits even while automatic pulls are blocked by an open tale", async () => {
    const pkg = samplePackage();
    pkg.turns[0].entries[0].text = "Edited an existing turn while offline.";
    pkg.state.data.gm.scratchpad = { note: "updated state" };
    pkg.tale.title = "Renamed while offline";
    pkg.turns.push({
      ...pkg.turns[0],
      id: "turn-2",
      seq: 2,
      entries: [
        { ...pkg.turns[0].entries[0], id: "entry-2", text: "New turn." },
      ],
    });
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
    const transport = {
      ...transportFixture(),
      put: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 3,
        metadataRev: 4,
      }),
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
      canPull: () => false,
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
          turns: expect.arrayContaining([expect.objectContaining({ seq: 1 })]),
        }),
      }),
      { idempotencyKey: "idem-sync" },
    );
    expect(transport.patch).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
    const uploaded = transport.put.mock.calls[0][1].package;
    expect(uploaded.turns).toHaveLength(2);
    expect(uploaded.turns[0].entries[0].text).toBe(
      pkg.turns[0].entries[0].text,
    );
    expect(uploaded.tale.title).toBe(pkg.tale.title);
    expect(uploaded.state.data.gm.scratchpad).toEqual({
      note: "updated state",
    });
    expect(syncRepo.acknowledgeTaleSyncWrite).toHaveBeenCalledOnce();
    expect(transport.put.mock.invocationCallOrder[0]).toBeLessThan(
      syncRepo.acknowledgeTaleSyncWrite.mock.invocationCallOrder[0],
    );
  });

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
    const transport = transportFixture();
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
      ...transportFixture(),
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 3,
        metadataRev: 3,
        package: toSyncTalePackage(samplePackage(), { mode: "hosted" }),
      }),
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
        ...transportFixture(),
        get: vi.fn().mockResolvedValue({
          id: "remote-tale",
          contentRev: 3,
          metadataRev: 4,
          package: remotePackage,
        }),
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

  it.each([false, true])(
    "refreshes hosted tokens with a revoked session: %s",
    async (revoked) => {
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
          revoked
            ? {
                ok: false,
                status: 400,
                json: async () => ({
                  error: "invalid_grant",
                  error_description: "Session revoked",
                }),
              }
            : jsonResponse({
                access_token: "new-access-token",
                expires_in: 3600,
                refresh_token: "new-refresh-token",
                token_type: "Bearer",
              }),
        );

      const request = refreshHostedSync({
        profile: {
          id: "cloud",
          baseUrl: "https://sync.example",
          mode: "hosted",
        },
        refreshToken: "refresh-token",
      });

      if (revoked) {
        await expect(request).rejects.toMatchObject({
          status: 400,
          code: "invalid_grant",
          message: "Session revoked",
        });
        expect(opener.openUrl).not.toHaveBeenCalled();
        return;
      }
      const result = await request;

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
    },
  );

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
      ...transportFixture(),
      patch: vi.fn().mockResolvedValue({
        id: "account-1",
        emailNormalized: "player@example.com",
        displayName: "Player",
        avatarUrl: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    };

    const account = await updateHostedAccountProfile(transport, {
      displayName: "Player",
    });

    expect(transport.patch).toHaveBeenCalledWith("/v1/accounts/me", {
      displayName: "Player",
    });
    expect(account.displayName).toBe("Player");
  });

  it("unregisters a hosted device", async () => {
    const transport = {
      ...transportFixture(),
      delete: vi.fn().mockResolvedValue(null),
    };

    await unregisterHostedDevice(transport, "device/2");

    expect(transport.delete).toHaveBeenCalledWith("/v1/devices/device%2F2");
  });

  it("imports a remote tale package and links local sync state", async () => {
    taleRepo.importTalePackage.mockResolvedValueOnce("local-imported");
    const transport = {
      ...transportFixture(),
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
      ...transportFixture(),
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
      ...transportFixture(),
      get: vi.fn().mockResolvedValue({
        id: "remote-tale",
        contentRev: 8,
        metadataRev: 9,
        turnCount: 1,
        package: remotePackage,
      }),
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
