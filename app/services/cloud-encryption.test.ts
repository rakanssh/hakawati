import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetCloudEncryptionStatus,
  migrateCloudSaves,
  resetCloudEncryption,
  resolveCloudEncryption,
  useCloudEncryptionStore,
  type CloudKeyInfo,
} from "./cloud-encryption";
import {
  SyncHttpError,
  type CloudEncryptionSession,
  type SyncCapabilities,
  type SyncTransport,
} from "./sync";

const mocks = vi.hoisted(() => {
  const pending = new Map<string, Record<string, unknown>>();
  return {
    pending,
    invoke: vi.fn(),
    syncRepo: {
      advanceMigratedTaleRevisions: vi.fn(),
      relinkTalesAfterCloudReset: vi.fn(async () => pending.clear()),
      getPendingSyncWrite: vi.fn(
        async ({ writeKey }: { writeKey: string }) =>
          pending.get(writeKey) ?? null,
      ),
      savePendingSyncWrite: vi.fn(
        async ({
          writeKey,
          profileId: _profileId,
          accountId: _accountId,
          ...write
        }: Record<string, unknown> & { writeKey: string }) => {
          pending.set(writeKey, write);
        },
      ),
      deletePendingSyncWrite: vi.fn(
        async ({ writeKey }: { writeKey: string }) => {
          pending.delete(writeKey);
        },
      ),
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@/repositories/sync.repository", () => mocks.syncRepo);
vi.mock("@/repositories/tale.repository", () => ({}));
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

const KEY_ID = "8d5f0f7e-1c1a-4c47-9a0b-5f8c2f0b6c1e";
const OTHER_KEY_ID = "1b9a3c47-5d6e-4f70-8a91-b2c3d4e5f607";

const profile = {
  id: "hosted",
  baseUrl: "https://sync.example",
  mode: "hosted" as const,
  accountId: "account-1",
  deviceId: "device-1",
};

type Local = {
  keyId: string | null;
  hasKey: boolean;
  pendingKeyId: string | null;
  migrated?: boolean;
};

let local: Local;
let storedKeys: Map<string, string>;

function capabilities(cloudEncryption = ["client-v1"]): SyncCapabilities {
  return {
    server: "hakawati-cloud",
    apiVersion: "1",
    minimumClientVersion: "0.15.2",
    compatibility: { state: "compatible" },
    cloudSaveProtocol: 1,
    cloudEncryption,
    features: {
      sync: { state: "available" },
      catalogRead: { state: "available" },
      coverStorage: { state: "available" },
      publishing: { state: "available" },
    },
    limits: { maxPackageBytes: 2 * 1024 * 1024, maxStateBytes: 512 * 1024 },
    scenarioCatalog: { packageFormatVersion: 1, thumbnailUploads: "enabled" },
  };
}

function cloudKey(overrides: Partial<CloudKeyInfo> = {}): CloudKeyInfo {
  return {
    state: "client",
    keyId: KEY_ID,
    keyCheck: "check-1",
    recoveryWrappedKey: null,
    serverTaleCount: 0,
    ...overrides,
  };
}

function transport(info: CloudKeyInfo, session?: CloudEncryptionSession) {
  return {
    get: vi.fn(async (path: string) => {
      if (path === "/v1/accounts/me/cloud-key") return info;
      throw new Error(`Unexpected GET ${path}`);
    }),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...(session ? { cloudEncryption: session } : {}),
  } satisfies SyncTransport;
}

async function resolve(
  info: CloudKeyInfo,
  input: { mode?: "hosted" | "personal"; cloudEncryption?: string[] } = {},
) {
  forgetCloudEncryptionStatus();
  return resolveCloudEncryption({
    profile: { ...profile, mode: input.mode ?? "hosted" },
    transport: transport(info),
    capabilities: capabilities(input.cloudEncryption),
  });
}

describe("cloud encryption state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.clear();
    local = { keyId: null, hasKey: false, pendingKeyId: null };
    storedKeys = new Map();
    mocks.invoke.mockImplementation(
      async (command: string, args: Record<string, unknown>) => {
        switch (command) {
          case "cloud_key_local":
            return { ...local };
          case "cloud_key_adopt": {
            const adopted =
              storedKeys.get(args.keyId as string) === args.keyCheck;
            if (adopted) {
              local = {
                keyId: args.keyId as string,
                hasKey: true,
                pendingKeyId: null,
              };
            }
            return adopted;
          }
          case "cloud_key_discard_pending":
            local.pendingKeyId = null;
            return undefined;
          case "cloud_key_forget":
            local = { keyId: null, hasKey: false, pendingKeyId: null };
            return undefined;
          case "cloud_key_mark_migrated":
            local.migrated = true;
            return undefined;
          case "cloud_key_proof":
            return "proof-1";
          default:
            throw new Error(`Unexpected command ${command}`);
        }
      },
    );
  });

  it("syncs when this device holds the account's key", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    const migrating = await resolve(cloudKey({ state: "migrating" }));
    expect(migrating).toMatchObject({
      kind: "ready",
      session: { acceptServerTales: true },
    });
    expect(local.migrated).toBeUndefined();
    const status = await resolve(cloudKey());
    expect(status).toMatchObject({
      kind: "ready",
      session: {
        serverOrigin: "https://sync.example",
        accountId: "account-1",
        keyId: KEY_ID,
        acceptServerTales: false,
      },
    });
    expect(local.migrated).toBe(true);
  });

  it("pauses when a finished migration is reported as migrating again", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null, migrated: true };
    expect(await resolve(cloudKey({ state: "migrating" }))).toEqual({
      kind: "paused",
      reason: "downgraded",
    });
  });

  it("pauses when an encrypted account is reported as server-encrypted", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    expect(
      await resolve(cloudKey({ state: "server", keyId: null, keyCheck: null })),
    ).toEqual({ kind: "paused", reason: "downgraded" });
    expect(await resolve(cloudKey(), { cloudEncryption: [] })).toEqual({
      kind: "paused",
      reason: "downgraded",
    });
  });

  it("asks to unlock again when the key changed", async () => {
    local = { keyId: OTHER_KEY_ID, hasKey: true, pendingKeyId: null };
    expect(await resolve(cloudKey())).toMatchObject({
      kind: "locked",
      reason: "changed",
    });
  });

  it("runs setup for a hosted account still on server encryption", async () => {
    expect(
      await resolve(cloudKey({ state: "server", keyId: null, keyCheck: null })),
    ).toMatchObject({ kind: "setup" });
    expect(
      await resolve(cloudKey({ state: "server", keyId: null }), {
        mode: "personal",
        cloudEncryption: [],
      }),
    ).toEqual({ kind: "plaintext" });
  });

  it("asks a new device to unlock an encrypted account", async () => {
    expect(await resolve(cloudKey({ state: "migrating" }))).toMatchObject({
      kind: "locked",
      reason: "missing",
    });
    expect(await resolve(cloudKey())).toMatchObject({
      kind: "locked",
      reason: "missing",
    });
    local = { keyId: KEY_ID, hasKey: false, pendingKeyId: null };
    expect(await resolve(cloudKey())).toMatchObject({
      kind: "locked",
      reason: "missing",
    });
  });

  it("finishes a setup whose response was lost", async () => {
    local = { keyId: null, hasKey: false, pendingKeyId: KEY_ID };
    storedKeys.set(KEY_ID, "check-1");
    expect(await resolve(cloudKey({ state: "migrating" }))).toMatchObject({
      kind: "ready",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("cloud_key_adopt", {
      scope: { serverOrigin: "https://sync.example", accountId: "account-1" },
      keyId: KEY_ID,
      keyCheck: "check-1",
    });
  });

  it("drops a pending setup when another device set up first", async () => {
    local = { keyId: null, hasKey: false, pendingKeyId: OTHER_KEY_ID };
    storedKeys.set(OTHER_KEY_ID, "other-check");
    expect(await resolve(cloudKey({ state: "migrating" }))).toMatchObject({
      kind: "locked",
      reason: "missing",
    });
    expect(mocks.invoke).toHaveBeenCalledWith(
      "cloud_key_discard_pending",
      expect.anything(),
    );
  });

  it("runs setup again after cloud saves were reset", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    expect(
      await resolve(
        cloudKey({ state: "migrating", keyId: null, keyCheck: null }),
      ),
    ).toMatchObject({ kind: "setup" });
  });

  it("forgets the key and relinks local tales after a reset", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    const connection = transport(cloudKey());
    connection.post.mockResolvedValue(
      cloudKey({ state: "migrating", keyId: null, keyCheck: null }),
    );
    await resetCloudEncryption({
      profile,
      transport: connection,
      keyId: KEY_ID,
    });
    expect(connection.post).toHaveBeenCalledWith(
      "/v1/accounts/me/cloud-key/reset",
      { confirmDeleteCloudSaves: true, keyId: KEY_ID },
    );
    expect(local.keyId).toBeNull();
    expect(mocks.syncRepo.relinkTalesAfterCloudReset).toHaveBeenCalledWith(
      "hosted",
      "account-1",
    );
    expect(
      mocks.syncRepo.savePendingSyncWrite.mock.invocationCallOrder[0],
    ).toBeLessThan(connection.post.mock.invocationCallOrder[0]);
  });

  it("finishes a reset whose response was lost", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    const connection = transport(cloudKey());
    connection.post.mockRejectedValue(new Error("Network error"));
    await expect(
      resetCloudEncryption({ profile, transport: connection, keyId: KEY_ID }),
    ).rejects.toThrow("Network error");
    expect(mocks.pending.has("cloud-reset")).toBe(true);
    expect(mocks.syncRepo.relinkTalesAfterCloudReset).not.toHaveBeenCalled();

    const after = cloudKey({ state: "migrating", keyId: null, keyCheck: null });
    const reopened = transport(after);
    reopened.post.mockResolvedValue(after);
    expect(
      await resolveCloudEncryption({
        profile,
        transport: reopened,
        capabilities: capabilities(),
      }),
    ).toMatchObject({ kind: "setup" });
    expect(local.keyId).toBeNull();
    expect(mocks.syncRepo.relinkTalesAfterCloudReset).toHaveBeenCalledWith(
      "hosted",
      "account-1",
    );
  });

  it("retries an interrupted reset before reading the key or resuming sync", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    const connection = transport(cloudKey());
    connection.post.mockRejectedValue(new Error("Network error"));
    await expect(
      resetCloudEncryption({ profile, transport: connection, keyId: KEY_ID }),
    ).rejects.toThrow("Network error");

    const after = cloudKey({ state: "migrating", keyId: null, keyCheck: null });
    connection.post.mockImplementationOnce(async () => {
      connection.get.mockResolvedValue(after);
      return after;
    });
    const check = () =>
      resolveCloudEncryption({
        profile,
        transport: connection,
        capabilities: capabilities(),
      });
    const results = await Promise.all([check(), check()]);
    for (const status of results) expect(status.kind).toBe("setup");
    expect(connection.post).toHaveBeenCalledTimes(2);
    expect(connection.post.mock.calls[1]).toEqual(
      connection.post.mock.calls[0],
    );
    expect(connection.post.mock.invocationCallOrder[1]).toBeLessThan(
      connection.get.mock.invocationCallOrder[0],
    );
    expect(mocks.pending.has("cloud-reset")).toBe(false);
    expect(local.keyId).toBeNull();
    expect(mocks.syncRepo.relinkTalesAfterCloudReset).toHaveBeenCalledOnce();
  });

  it("relinks after a reset retry finds a replacement key and keeps that key", async () => {
    local = { keyId: OTHER_KEY_ID, hasKey: true, pendingKeyId: null };
    mocks.pending.set("cloud-reset", { idempotencyKey: KEY_ID });
    const connection = transport(cloudKey({ keyId: OTHER_KEY_ID }));
    connection.post.mockRejectedValue(
      new SyncHttpError("Changed", 409, "cloud_key_mismatch"),
    );
    forgetCloudEncryptionStatus();
    expect(
      await resolveCloudEncryption({
        profile,
        transport: connection,
        capabilities: capabilities(),
      }),
    ).toMatchObject({ kind: "ready", session: { keyId: OTHER_KEY_ID } });
    expect(local.keyId).toBe(OTHER_KEY_ID);
    expect(mocks.syncRepo.relinkTalesAfterCloudReset).toHaveBeenCalledOnce();
    expect(mocks.pending.has("cloud-reset")).toBe(false);
  });

  it("remembers when another device completes a migration", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    const status = await resolve(cloudKey({ state: "migrating" }));
    if (status.kind !== "ready")
      throw new Error("Expected a migration session");
    const connection = transport(cloudKey(), status.session);
    await migrateCloudSaves({
      profile,
      transport: connection,
      remoteTales: [],
    });
    expect(connection.post).not.toHaveBeenCalled();
    expect(local.migrated).toBe(true);
    connection.get.mockResolvedValue(cloudKey({ state: "migrating" }));
    expect(
      await resolveCloudEncryption({
        profile,
        transport: connection,
        capabilities: capabilities(),
      }),
    ).toEqual({ kind: "paused", reason: "downgraded" });
  });

  it("drops a reset the cloud refused", async () => {
    const connection = transport(cloudKey());
    connection.post.mockRejectedValue(
      new SyncHttpError("Changed", 409, "cloud_key_mismatch"),
    );
    await expect(
      resetCloudEncryption({ profile, transport: connection, keyId: KEY_ID }),
    ).rejects.toMatchObject({ code: "cloud_key_mismatch" });
    expect(mocks.pending.has("cloud-reset")).toBe(false);
  });

  it("drops a stored reset the cloud refuses and keeps syncing", async () => {
    local = { keyId: KEY_ID, hasKey: true, pendingKeyId: null };
    const connection = transport(cloudKey());
    const check = () =>
      resolveCloudEncryption({
        profile,
        transport: connection,
        capabilities: capabilities(),
      });

    mocks.pending.set("cloud-reset", { idempotencyKey: KEY_ID });
    connection.post.mockRejectedValueOnce(
      new SyncHttpError("Slow down", 429, "rate_limited"),
    );
    forgetCloudEncryptionStatus();
    await expect(check()).rejects.toMatchObject({ status: 429 });
    expect(mocks.pending.has("cloud-reset")).toBe(true);

    connection.post.mockRejectedValueOnce(
      new SyncHttpError("Not encrypted", 409, "cloud_encryption_not_enabled"),
    );
    forgetCloudEncryptionStatus();
    expect(await check()).toMatchObject({ kind: "ready" });
    expect(mocks.pending.has("cloud-reset")).toBe(false);
    expect(local.keyId).toBe(KEY_ID);
    expect(mocks.syncRepo.relinkTalesAfterCloudReset).not.toHaveBeenCalled();
  });
});

describe("cloud save migration", () => {
  const session: CloudEncryptionSession = {
    serverOrigin: "https://sync.example",
    accountId: "account-1",
    keyId: KEY_ID,
    acceptServerTales: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.clear();
    mocks.invoke.mockImplementation(
      async (command: string, args: Record<string, unknown>) => {
        if (command === "cloud_tale_encrypt") {
          const envelope = (part: string) => ({
            v: 1,
            scheme: "client-v1",
            alg: "aes-256-gcm",
            keyId: args.keyId,
            nonce: "n",
            ciphertext: Buffer.from(
              JSON.stringify({ part, revision: args.revision }),
            ).toString("base64"),
            tag: "t",
          });
          return { summary: envelope("summary"), package: envelope("package") };
        }
        if (command === "cloud_cover_encrypt") return "ZW5jcnlwdGVk";
        if (command === "cloud_key_proof") return "proof-1";
        if (command === "cloud_key_mark_migrated") return undefined;
        throw new Error(`Unexpected command ${command}`);
      },
    );
  });

  function serverPackage(contentRev: number, metadataRev: number) {
    return {
      id: "remote-1",
      sourceTaleId: "local-1",
      contentRev,
      metadataRev,
      turnCount: 0,
      entryCount: 0,
      encryption: "server",
      package: {
        format: "hakawati-tale-package",
        formatVersion: 1,
        exportedAt: "2026-11-20T00:00:00.000Z",
        tale: {
          id: "local-1",
          title: "Old tale",
          description: "",
          gameMode: "story_teller",
          coverAssetId: "old-cover",
          thumbnailAssetId: "old-cover",
          createdAt: 1,
          updatedAt: 2,
          schemaVersion: 1,
        },
        state: { stateSchemaVersion: 1, data: {} },
        turns: [],
        assets: [],
      },
      cover: {
        assetId: "old-cover",
        contentType: "image/webp",
        byteSize: 4,
        sha256: "plain",
        downloadUrl: "/v1/assets/old-cover/download",
      },
    };
  }

  function migrationTransport() {
    let downloads = 0;
    let keyState: CloudKeyInfo = cloudKey({
      state: "migrating",
      serverTaleCount: 1,
    });
    const connection = {
      get: vi.fn(async (path: string) => {
        if (path === "/v1/accounts/me/cloud-key") return keyState;
        if (path === "/v1/tales/remote-1/package") {
          downloads += 1;
          return serverPackage(
            downloads === 1 ? 2 : 3,
            downloads === 1 ? 2 : 3,
          );
        }
        throw new Error(`Unexpected GET ${path}`);
      }),
      getBytes: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
      post: vi.fn(async (path: string, body: unknown) => {
        if (path === "/v1/assets/cover-upload-intents") {
          return {
            asset: { assetId: (body as { assetId: string }).assetId },
            upload: { url: "https://objects.example/put", headers: {} },
          };
        }
        if (path.endsWith("/complete")) return {};
        if (path === "/v1/accounts/me/cloud-key/complete-migration") {
          return cloudKey({ state: "client" });
        }
        throw new Error(`Unexpected POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      cloudEncryption: session,
    } satisfies SyncTransport;
    return {
      connection,
      finish: () => {
        keyState = cloudKey({ state: "migrating", serverTaleCount: 0 });
      },
    };
  }

  it("re-encrypts server tales with both base revisions, retries conflicts and completes", async () => {
    const http = await import("@tauri-apps/plugin-http");
    vi.mocked(http.fetch).mockResolvedValue({ ok: true } as Response);
    const { connection, finish } = migrationTransport();
    connection.put
      .mockRejectedValueOnce(
        new SyncHttpError("Changed", 409, "content_conflict"),
      )
      .mockImplementation(async () => {
        finish();
        return { contentRev: 4, metadataRev: 4 };
      });

    const result = await migrateCloudSaves({
      profile,
      transport: connection,
      remoteTales: [
        {
          id: "remote-1",
          sourceTaleId: "local-1",
          encryption: "server",
          title: "Old tale",
          description: null,
          gameMode: "story_teller",
          coverAssetId: "old-cover",
          thumbnailAssetId: "old-cover",
          contentRev: 2,
          metadataRev: 2,
          turnCount: 0,
          updatedAt: "2026-11-20",
          lastEntryPreview: null,
        },
      ],
    });

    expect(result.state).toBe("client");
    expect(connection.getBytes).toHaveBeenCalledWith(
      "/v1/assets/old-cover/download",
    );
    const [, retry] = connection.put.mock.calls;
    expect(retry[0]).toBe("/v1/tales/remote-1/package");
    const body = JSON.parse((retry[2] as { rawBody: string }).rawBody);
    expect(body).toMatchObject({
      baseContentRev: 3,
      baseMetadataRev: 3,
      confirmReplace: true,
      encryptedPackage: { taleId: "remote-1", keyId: KEY_ID },
    });
    expect(body.encryptedPackage.coverAssetId).not.toBe("old-cover");
    expect(body.encryptedPackage.coverAssetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      JSON.parse(
        Buffer.from(
          body.encryptedPackage.package.ciphertext,
          "base64",
        ).toString(),
      ).revision,
    ).toEqual({ taleId: "remote-1", contentRev: 4, metadataRev: 4 });
    const encrypted = mocks.invoke.mock.calls.filter(
      ([command]) => command === "cloud_tale_encrypt",
    );
    expect(
      JSON.parse((encrypted.at(-1)![1] as { summary: string }).summary),
    ).toMatchObject({ migratedFrom: { contentRev: 3, metadataRev: 3 } });
    expect(mocks.syncRepo.advanceMigratedTaleRevisions).toHaveBeenCalledWith({
      profileId: "hosted",
      accountId: "account-1",
      remoteTaleId: "remote-1",
      baseContentRev: 3,
      baseMetadataRev: 3,
      contentRev: 4,
      metadataRev: 4,
    });
    expect(connection.post).toHaveBeenCalledWith(
      "/v1/accounts/me/cloud-key/complete-migration",
      { keyProof: "proof-1" },
    );
    expect(mocks.invoke).toHaveBeenCalledWith("cloud_key_mark_migrated", {
      scope: { serverOrigin: "https://sync.example", accountId: "account-1" },
      keyId: KEY_ID,
    });
    expect(mocks.pending.size).toBe(0);
  });

  it("reuses the encrypted cover when the cloud is full and reports it", async () => {
    const http = await import("@tauri-apps/plugin-http");
    vi.mocked(http.fetch).mockResolvedValue({ ok: true } as Response);
    const { connection, finish } = migrationTransport();
    connection.put
      .mockRejectedValueOnce(
        new SyncHttpError("Quota exceeded.", 409, "quota_exceeded"),
      )
      .mockImplementation(async () => {
        finish();
        return { contentRev: 4, metadataRev: 4 };
      });
    const migrate = () =>
      migrateCloudSaves({
        profile,
        transport: connection,
        remoteTales: [
          {
            id: "remote-1",
            sourceTaleId: "local-1",
            encryption: "server",
            title: "Old tale",
            description: null,
            gameMode: "story_teller",
            coverAssetId: "old-cover",
            thumbnailAssetId: "old-cover",
            contentRev: 2,
            metadataRev: 2,
            turnCount: 0,
            updatedAt: "2026-11-20",
            lastEntryPreview: null,
          },
        ],
      });
    const failure = () => useCloudEncryptionStore.getState().migrationFailure;

    await expect(migrate()).rejects.toMatchObject({ code: "quota_exceeded" });
    expect(failure()).toEqual({
      scope: "https://sync.example account-1",
      code: "quota_exceeded",
    });
    expect(mocks.pending.size).toBe(0);

    await migrate();

    const intents = connection.post.mock.calls.filter(
      ([path]) => path === "/v1/assets/cover-upload-intents",
    );
    expect(intents).toHaveLength(1);
    expect(connection.getBytes).toHaveBeenCalledOnce();
    const [first, second] = connection.put.mock.calls.map(
      (call) =>
        JSON.parse((call[2] as { rawBody: string }).rawBody).encryptedPackage
          .coverAssetId,
    );
    expect(second).toBe(first);
    expect(failure()).toBeNull();
  });

  it("resends a stored migration write before downloading again", async () => {
    const { connection, finish } = migrationTransport();
    mocks.pending.set("migrate:remote-1", {
      idempotencyKey: "migrate-key",
      method: "PUT",
      path: "/v1/tales/remote-1/package",
      body: JSON.stringify({ baseContentRev: 2, baseMetadataRev: 2 }),
      saveVersion: null,
    });
    connection.put.mockImplementation(async () => {
      finish();
      return { contentRev: 3, metadataRev: 3 };
    });

    await migrateCloudSaves({
      profile,
      transport: connection,
      remoteTales: [
        {
          id: "remote-1",
          sourceTaleId: "local-1",
          encryption: "server",
          title: "",
          description: null,
          gameMode: "story_teller",
          coverAssetId: null,
          thumbnailAssetId: null,
          contentRev: 2,
          metadataRev: 2,
          turnCount: 0,
          updatedAt: "2026-11-20",
          lastEntryPreview: null,
        },
      ],
    });

    expect(connection.put).toHaveBeenCalledOnce();
    expect(connection.put.mock.calls[0][2]).toEqual({
      idempotencyKey: "migrate-key",
      rawBody: JSON.stringify({ baseContentRev: 2, baseMetadataRev: 2 }),
    });
    expect(connection.get).not.toHaveBeenCalledWith(
      "/v1/tales/remote-1/package",
    );
    expect(mocks.syncRepo.advanceMigratedTaleRevisions).toHaveBeenCalledWith(
      expect.objectContaining({ baseContentRev: 2, contentRev: 3 }),
    );
  });
});
