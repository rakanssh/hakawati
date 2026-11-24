import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameMode } from "@/types/context.type";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import type { TalePackageV1 } from "@/types/export.type";
import type { CloudEnvelope } from "./cloud-keys";
import {
  applyRemoteTalePackage,
  downloadRemoteTalePackage,
  listRemoteTales,
  replaceRemoteTalePackage,
  SyncHttpError,
  uploadTalePackage,
  type CloudEncryptionSession,
  type SyncCapabilities,
  type SyncTransport,
} from "./sync";

const mocks = vi.hoisted(() => {
  const pending = new Map<string, Record<string, unknown>>();
  return {
    pending,
    fetch: vi.fn(),
    invoke: vi.fn(),
    taleRepo: {
      exportTalePackage: vi.fn(),
      getTaleSaveVersion: vi.fn(async () => 7),
      importTalePackage: vi.fn(),
      replaceTaleWithPackage: vi.fn(async () => true),
    },
    syncRepo: {
      acknowledgeTaleSyncWrite: vi.fn(async () => true),
      adoptTaleSyncRevisions: vi.fn(async () => true),
      getTaleSyncState: vi.fn(),
      setSyncProfileDisabled: vi.fn(),
      setTaleSyncStatus: vi.fn(),
      upsertSyncProfile: vi.fn(),
      upsertTaleSyncState: vi.fn(),
      upsertTaleSyncStateIfTaleVersion: vi.fn(async () => true),
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
        async ({
          writeKey,
          idempotencyKey,
        }: {
          writeKey: string;
          idempotencyKey?: string;
        }) => {
          if (
            !idempotencyKey ||
            pending.get(writeKey)?.idempotencyKey === idempotencyKey
          ) {
            pending.delete(writeKey);
          }
        },
      ),
    },
  };
});

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/repositories/tale.repository", () => mocks.taleRepo);
vi.mock("@/repositories/sync.repository", () => mocks.syncRepo);
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));
vi.mock("@/lib/cover-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cover-image")>()),
  optimizeCoverImage: async (input: { bytes: Uint8Array }) => ({
    ...input,
    contentType: "image/png",
    width: 1,
    height: 1,
  }),
}));

const KEY_ID = "8d5f0f7e-1c1a-4c47-9a0b-5f8c2f0b6c1e";
const REMOTE_ID = "6f2f7d1e-3c4b-4a5d-9e8f-0a1b2c3d4e5f";

const session: CloudEncryptionSession = {
  serverOrigin: "https://sync.example",
  accountId: "account-1",
  keyId: KEY_ID,
  acceptServerTales: false,
};

const profile = {
  id: "hosted",
  baseUrl: "https://sync.example",
  mode: "hosted" as const,
  accountId: "account-1",
  deviceId: "device-1",
};

type Revision = { taleId: string; contentRev: number; metadataRev: number };
type KeyArgs = {
  scope: { accountId: string };
  keyId: string;
  revision: Revision;
};

let nonce = 0;

function aad(args: KeyArgs, revision: Revision, purpose: string) {
  return JSON.stringify({
    accountId: args.scope.accountId,
    keyId: args.keyId,
    purpose,
    ...revision,
  });
}

function seal(
  args: KeyArgs,
  revision: Revision,
  purpose: string,
  plaintext: string,
): CloudEnvelope {
  nonce += 1;
  return {
    v: 1,
    scheme: "client-v1",
    alg: "aes-256-gcm",
    keyId: args.keyId,
    nonce: Buffer.from(String(nonce).padStart(12, "0")).toString("base64"),
    ciphertext: Buffer.from(
      JSON.stringify({ aad: aad(args, revision, purpose), plaintext }),
    ).toString("base64"),
    tag: Buffer.alloc(16).toString("base64"),
  };
}

function open(
  args: KeyArgs,
  revision: Revision,
  purpose: string,
  envelope: CloudEnvelope,
): string {
  const sealed = JSON.parse(
    Buffer.from(envelope.ciphertext, "base64").toString(),
  ) as { aad: string; plaintext: string };
  if (
    envelope.keyId !== args.keyId ||
    sealed.aad !== aad(args, revision, purpose)
  ) {
    throw "decrypt_failed";
  }
  return sealed.plaintext;
}

// Stands in for the Rust commands, including their additional authenticated data.
function fakeRust(command: string, args: Record<string, unknown>) {
  const keyArgs = args as unknown as KeyArgs;
  switch (command) {
    case "cloud_tale_encrypt":
      return {
        summary: seal(
          keyArgs,
          keyArgs.revision,
          "tale.summary",
          args.summary as string,
        ),
        package: seal(
          keyArgs,
          keyArgs.revision,
          "tale.package",
          args.package as string,
        ),
      };
    case "cloud_tale_decrypt":
      return {
        summary: open(
          keyArgs,
          keyArgs.revision,
          "tale.summary",
          args.summary as CloudEnvelope,
        ),
        package: open(
          keyArgs,
          keyArgs.revision,
          "tale.package",
          args.package as CloudEnvelope,
        ),
      };
    case "cloud_summaries_decrypt":
      return (args.items as Array<Revision & { summary: CloudEnvelope }>).map(
        ({ summary, ...revision }) => {
          try {
            return open(keyArgs, revision, "tale.summary", summary);
          } catch {
            return null;
          }
        },
      );
    case "cloud_cover_encrypt": {
      const image = Buffer.from(args.imageBase64 as string, "base64");
      return Buffer.concat([
        Buffer.alloc(12, 1),
        image,
        Buffer.alloc(16, 2),
      ]).toString("base64");
    }
    default:
      throw new Error(`Unexpected command ${command}`);
  }
}

function talePackage(withCover = false): TalePackageV1 {
  return {
    format: "hakawati-tale-package",
    formatVersion: 1,
    exportedAt: "2026-11-20T00:00:00.000Z",
    tale: {
      id: "local-tale",
      title: "The Iron Gate",
      description: "A secret description",
      gameMode: GameMode.STORY_TELLER,
      ...(withCover ? { thumbnailAssetId: "thumbnail" } : {}),
      createdAt: 1,
      updatedAt: 2,
      schemaVersion: 1,
    },
    state: {
      stateSchemaVersion: 1,
      data: {
        components: [],
        storyCards: [],
        gm: { stats: [], inventory: [], scratchpad: {} },
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
            text: "The gate   opens.",
          },
          {
            id: "entry-2",
            role: LogEntryRole.PLAYER,
            mode: LogEntryMode.STORY,
            text: "I walk through.",
          },
        ],
      },
    ],
    assets: withCover
      ? [
          {
            id: "thumbnail",
            role: "thumbnail",
            contentType: "image/png",
            dataBase64: Buffer.from("png-bytes").toString("base64"),
          },
        ]
      : [],
  };
}

function capabilities(): SyncCapabilities {
  return {
    server: "hakawati-cloud",
    apiVersion: "1",
    minimumClientVersion: "0.15.2",
    compatibility: { state: "compatible" },
    cloudSaveProtocol: 1,
    cloudEncryption: ["client-v1"],
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

function transport(cloudEncryption: CloudEncryptionSession | null = session) {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...(cloudEncryption ? { cloudEncryption } : {}),
  } satisfies SyncTransport;
}

function sentBody(call: unknown[]) {
  const options = call[2] as { rawBody: string; idempotencyKey: string };
  expect(call[1]).toBeUndefined();
  return {
    raw: options.rawBody,
    idempotencyKey: options.idempotencyKey,
    body: JSON.parse(options.rawBody) as Record<string, unknown> & {
      encryptedPackage: Record<string, unknown> & {
        summary: CloudEnvelope;
        package: CloudEnvelope;
      };
    },
  };
}

function decrypted(
  envelope: CloudEnvelope,
  revision: Revision,
  purpose: string,
) {
  return JSON.parse(
    open(
      { scope: { accountId: "account-1" }, keyId: KEY_ID, revision },
      revision,
      purpose,
      envelope,
    ),
  );
}

async function encryptedDownload(
  revision: Revision,
  overrides: Record<string, unknown> = {},
) {
  const pkg = {
    ...talePackage(),
    turns: talePackage().turns.map(
      ({ updatedAt: _updatedAt, ...turn }) => turn,
    ),
  };
  const sealed = fakeRust("cloud_tale_encrypt", {
    scope: { accountId: "account-1" },
    keyId: KEY_ID,
    revision,
    summary: JSON.stringify({
      title: "The Iron Gate",
      description: "",
      lastEntryPreview: null,
      cover: null,
    }),
    package: JSON.stringify(pkg),
  }) as { summary: CloudEnvelope; package: CloudEnvelope };
  return {
    id: revision.taleId,
    sourceTaleId: "local-tale",
    contentRev: revision.contentRev,
    metadataRev: revision.metadataRev,
    turnCount: 1,
    entryCount: 2,
    encryption: "client",
    encryptedPackage: {
      scheme: "client-v1",
      keyId: KEY_ID,
      taleId: revision.taleId,
      sourceTaleId: "local-tale",
      gameMode: GameMode.STORY_TELLER,
      stateSchemaVersion: 1,
      turnCount: 1,
      entryCount: 2,
      coverAssetId: null,
      createdAt: 1,
      updatedAt: 2,
      ...sealed,
      ...overrides,
    },
    cover: null,
  };
}

describe("end-to-end encrypted sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.clear();
    mocks.invoke.mockImplementation(async (command: string, args) =>
      fakeRust(command, args as Record<string, unknown>),
    );
    mocks.taleRepo.getTaleSaveVersion.mockResolvedValue(7);
    mocks.taleRepo.exportTalePackage.mockImplementation(async () =>
      talePackage(),
    );
  });

  it("encrypts a new tale under a client-chosen ID and resends the stored body on retry", async () => {
    const connection = transport();
    connection.post.mockRejectedValueOnce(new TypeError("network down"));

    await expect(
      uploadTalePackage({
        profile,
        transport: connection,
        localTaleId: "local-tale",
        idempotencyKey: "upload-1",
        capabilities: capabilities(),
      }),
    ).rejects.toThrow("network down");
    const first = sentBody(connection.post.mock.calls[0]);
    const encrypted = first.body.encryptedPackage;
    expect(connection.post.mock.calls[0][0]).toBe("/v1/tales");
    expect(first.body.package).toBeUndefined();
    expect(first.raw).not.toContain("Iron Gate");
    expect(first.raw).not.toContain("gate");
    expect(encrypted).toMatchObject({
      scheme: "client-v1",
      keyId: KEY_ID,
      sourceTaleId: "local-tale",
      gameMode: GameMode.STORY_TELLER,
      stateSchemaVersion: 1,
      turnCount: 1,
      entryCount: 2,
      coverAssetId: null,
    });
    expect(encrypted.taleId).toMatch(/^[0-9a-f-]{36}$/);
    const revision = {
      taleId: encrypted.taleId as string,
      contentRev: 1,
      metadataRev: 1,
    };
    expect(decrypted(encrypted.summary, revision, "tale.summary")).toEqual({
      title: "The Iron Gate",
      description: "A secret description",
      lastEntryPreview: "I walk through.",
      cover: null,
    });
    expect(
      decrypted(encrypted.package, revision, "tale.package").tale.title,
    ).toBe("The Iron Gate");

    connection.post.mockClear();
    connection.post.mockResolvedValueOnce({
      id: encrypted.taleId,
      contentRev: 1,
      metadataRev: 1,
    });
    await uploadTalePackage({
      profile,
      transport: connection,
      localTaleId: "local-tale",
      idempotencyKey: "upload-1",
      capabilities: capabilities(),
    });
    const retry = sentBody(connection.post.mock.calls[0]);
    expect(retry.raw).toBe(first.raw);
    expect(retry.idempotencyKey).toBe("upload-1");
    expect(mocks.taleRepo.exportTalePackage).toHaveBeenCalledTimes(1);
    expect(mocks.pending.size).toBe(0);
    expect(
      mocks.syncRepo.upsertTaleSyncStateIfTaleVersion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTaleId: encrypted.taleId,
        contentRev: "1",
        metadataRev: "1",
        pendingStatus: "idle",
      }),
      7,
    );
  });

  it("binds replaces to the next revisions and sends both base revisions", async () => {
    mocks.syncRepo.getTaleSyncState.mockResolvedValue({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-tale",
      remoteTaleId: REMOTE_ID,
      contentRev: "3",
      metadataRev: "4",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const connection = transport();
    connection.put.mockResolvedValue({ contentRev: 4, metadataRev: 5 });

    await replaceRemoteTalePackage({
      profile,
      transport: connection,
      localTaleId: "local-tale",
      idempotencyKey: "sync-1",
      capabilities: capabilities(),
    });

    const { body } = sentBody(connection.put.mock.calls[0]);
    expect(connection.put.mock.calls[0][0]).toBe(
      `/v1/tales/${REMOTE_ID}/package`,
    );
    expect(body).toMatchObject({
      baseContentRev: 3,
      baseMetadataRev: 4,
      confirmReplace: true,
    });
    expect(body.encryptedPackage.taleId).toBe(REMOTE_ID);
    const next = { taleId: REMOTE_ID, contentRev: 4, metadataRev: 5 };
    expect(
      decrypted(body.encryptedPackage.package, next, "tale.package").tale.id,
    ).toBe("local-tale");
    expect(() =>
      decrypted(
        body.encryptedPackage.package,
        { ...next, contentRev: 3 },
        "tale.package",
      ),
    ).toThrow();
    expect(mocks.syncRepo.acknowledgeTaleSyncWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSaveVersion: 7,
        contentRev: "4",
        metadataRev: "5",
      }),
    );
  });

  it("keeps the stored body through a lost response even after a local edit", async () => {
    mocks.syncRepo.getTaleSyncState.mockResolvedValue({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-tale",
      remoteTaleId: REMOTE_ID,
      contentRev: "3",
      metadataRev: "4",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const connection = transport();
    connection.put
      .mockRejectedValueOnce(new SyncHttpError("Bad gateway", 502, "502"))
      .mockResolvedValueOnce({ contentRev: 4, metadataRev: 5 });
    const write = () =>
      replaceRemoteTalePackage({
        profile,
        transport: connection,
        localTaleId: "local-tale",
        idempotencyKey: "sync-1",
        capabilities: capabilities(),
      });

    await expect(write()).rejects.toThrow("Bad gateway");
    mocks.taleRepo.getTaleSaveVersion.mockResolvedValue(8);
    await write();

    const [first, retry] = connection.put.mock.calls.map(sentBody);
    expect(retry.raw).toBe(first.raw);
    expect(mocks.taleRepo.exportTalePackage).toHaveBeenCalledTimes(1);
    expect(mocks.syncRepo.acknowledgeTaleSyncWrite).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedSaveVersion: 7 }),
    );
  });

  it("abandons the stored body after a conflict and builds a new one for the next key", async () => {
    mocks.syncRepo.getTaleSyncState.mockResolvedValue({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-tale",
      remoteTaleId: REMOTE_ID,
      contentRev: "3",
      metadataRev: "4",
      lastSyncedAt: 1,
      pendingStatus: "push",
      lastErrorCode: null,
    });
    const connection = transport();
    connection.put
      .mockRejectedValueOnce(
        new SyncHttpError("Changed", 409, "content_conflict"),
      )
      .mockResolvedValueOnce({ contentRev: 4, metadataRev: 5 });

    await expect(
      replaceRemoteTalePackage({
        profile,
        transport: connection,
        localTaleId: "local-tale",
        idempotencyKey: "sync-1",
        capabilities: capabilities(),
      }),
    ).rejects.toMatchObject({ code: "content_conflict" });
    expect(mocks.pending.size).toBe(0);
    expect(mocks.syncRepo.setTaleSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({ pendingStatus: "conflict" }),
    );

    await replaceRemoteTalePackage({
      profile,
      transport: connection,
      localTaleId: "local-tale",
      idempotencyKey: "sync-2",
      capabilities: capabilities(),
    });
    const [first, second] = connection.put.mock.calls.map(sentBody);
    expect(second.idempotencyKey).toBe("sync-2");
    expect(second.raw).not.toBe(first.raw);
  });

  it("names the replaced revision when keeping the local copy of a conflict", async () => {
    mocks.syncRepo.getTaleSyncState.mockResolvedValue({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-tale",
      remoteTaleId: REMOTE_ID,
      contentRev: "3",
      metadataRev: "4",
      lastSyncedAt: 1,
      pendingStatus: "conflict",
      lastErrorCode: "remote_changed",
    });
    const connection = transport();
    connection.put.mockResolvedValue({ contentRev: 10, metadataRev: 12 });

    await replaceRemoteTalePackage({
      profile,
      transport: connection,
      localTaleId: "local-tale",
      idempotencyKey: "conflict-1",
      capabilities: capabilities(),
      forceReplace: true,
      remoteRevisions: { contentRev: 9, metadataRev: 11 },
    });

    const { body } = sentBody(connection.put.mock.calls[0]);
    expect(body).toMatchObject({ baseContentRev: 9, baseMetadataRev: 11 });
    expect(
      decrypted(
        body.encryptedPackage.summary,
        { taleId: REMOTE_ID, contentRev: 10, metadataRev: 12 },
        "tale.summary",
      ).title,
    ).toBe("The Iron Gate");
  });

  it("uploads covers encrypted under a client asset ID and keeps their fingerprint in the summary", async () => {
    mocks.taleRepo.exportTalePackage.mockResolvedValue(talePackage(true));
    mocks.fetch.mockResolvedValue({ ok: true });
    const connection = transport();
    connection.post.mockImplementation(async (path: string, body: unknown) => {
      if (path === "/v1/assets/cover-upload-intents") {
        const intent = body as { assetId: string };
        return {
          asset: { assetId: intent.assetId },
          upload: {
            url: "https://objects.example/put",
            method: "PUT",
            headers: {},
          },
        };
      }
      if (path.endsWith("/complete")) return {};
      return { id: REMOTE_ID, contentRev: 1, metadataRev: 1 };
    });

    await uploadTalePackage({
      profile,
      transport: connection,
      localTaleId: "local-tale",
      idempotencyKey: "upload-cover",
      capabilities: capabilities(),
    });

    const intent = connection.post.mock.calls[0][1] as Record<string, unknown>;
    const image = Buffer.from("png-bytes");
    expect(intent).toMatchObject({
      visibility: "private",
      encryption: "client-v1",
      contentType: "application/octet-stream",
      byteSize: image.length + 28,
    });
    expect(intent).not.toHaveProperty("width");
    const uploaded = mocks.fetch.mock.calls[0][1] as { body: Blob };
    expect(uploaded.body.type).toBe("application/octet-stream");
    expect(uploaded.body.size).toBe(image.length + 28);
    const create = sentBody(
      connection.post.mock.calls.find(([path]) => path === "/v1/tales")!,
    );
    expect(create.body.encryptedPackage.coverAssetId).toBe(intent.assetId);
    const summary = decrypted(
      create.body.encryptedPackage.summary,
      {
        taleId: create.body.encryptedPackage.taleId as string,
        contentRev: 1,
        metadataRev: 1,
      },
      "tale.summary",
    );
    expect(summary.cover).toMatchObject({
      assetId: intent.assetId,
      contentType: "image/png",
      byteSize: image.length,
    });
  });

  it("reads cloud summaries only after decrypting them and shows other tales as locked", async () => {
    const client = await encryptedDownload({
      taleId: REMOTE_ID,
      contentRev: 2,
      metadataRev: 3,
    });
    const listed = {
      items: [
        {
          id: REMOTE_ID,
          sourceTaleId: "local-tale",
          encryption: "client",
          summary: client.encryptedPackage.summary,
          title: null,
          description: null,
          gameMode: GameMode.STORY_TELLER,
          coverAssetId: null,
          thumbnailAssetId: null,
          cover: null,
          contentRev: 2,
          metadataRev: 3,
          turnCount: 1,
          updatedAt: "2026-11-20",
          lastEntryPreview: null,
        },
        {
          id: "server-tale",
          sourceTaleId: "old-tale",
          encryption: "server",
          summary: null,
          title: "Plaintext",
          description: null,
          gameMode: GameMode.STORY_TELLER,
          coverAssetId: null,
          thumbnailAssetId: null,
          contentRev: 1,
          metadataRev: 1,
          turnCount: 1,
          updatedAt: "2026-11-20",
          lastEntryPreview: null,
        },
      ],
      nextCursor: null,
    };

    const unlocked = transport();
    unlocked.get.mockResolvedValue(listed);
    const page = await listRemoteTales(unlocked);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: REMOTE_ID,
      title: "The Iron Gate",
      description: null,
      cover: null,
    });
    expect(page.items[0]).not.toHaveProperty("summary");

    const migrating = transport({ ...session, acceptServerTales: true });
    migrating.get.mockResolvedValue(listed);
    expect(
      (await listRemoteTales(migrating)).items.map((tale) => tale.id),
    ).toEqual([REMOTE_ID, "server-tale"]);

    const stale = transport();
    stale.get.mockResolvedValue({
      ...listed,
      items: [{ ...listed.items[0], contentRev: 1 }],
    });
    expect((await listRemoteTales(stale)).items[0]).toMatchObject({
      locked: true,
      title: "",
    });

    const locked = transport(null);
    locked.get.mockResolvedValue(listed);
    const lockedPage = await listRemoteTales(locked);
    expect(lockedPage.items[0]).toMatchObject({ locked: true, title: "" });
    expect(lockedPage.items[1]).toMatchObject({ title: "Plaintext" });
  });

  it("decrypts downloads and rejects records that disagree with the package", async () => {
    const revision = { taleId: REMOTE_ID, contentRev: 2, metadataRev: 3 };
    const connection = transport();
    connection.get.mockResolvedValueOnce(await encryptedDownload(revision));
    const remote = await downloadRemoteTalePackage(connection, REMOTE_ID);
    expect(remote).toMatchObject({
      id: REMOTE_ID,
      contentRev: 2,
      metadataRev: 3,
      encryption: "client",
    });
    expect(remote.package.tale.title).toBe("The Iron Gate");

    connection.get.mockResolvedValueOnce(
      await encryptedDownload(revision, { turnCount: 5 }),
    );
    await expect(
      downloadRemoteTalePackage(connection, REMOTE_ID),
    ).rejects.toMatchObject({ code: "cloud_tale_invalid" });

    connection.get.mockResolvedValueOnce({
      ...(await encryptedDownload(revision)),
      metadataRev: 4,
    });
    await expect(
      downloadRemoteTalePackage(connection, REMOTE_ID),
    ).rejects.toMatchObject({ code: "cloud_tale_invalid" });

    connection.get.mockResolvedValueOnce({
      id: REMOTE_ID,
      contentRev: 2,
      metadataRev: 3,
      encryption: "server",
      package: talePackage(),
    });
    await expect(
      downloadRemoteTalePackage(connection, REMOTE_ID),
    ).rejects.toMatchObject({ code: "cloud_encryption_downgraded" });

    const locked = transport(null);
    locked.get.mockResolvedValueOnce(await encryptedDownload(revision));
    await expect(
      downloadRemoteTalePackage(locked, REMOTE_ID),
    ).rejects.toMatchObject({ code: "cloud_locked" });
  });

  it("rejects a download older than the revision this device synced", async () => {
    mocks.syncRepo.getTaleSyncState.mockResolvedValue({
      profileId: "hosted",
      accountId: "account-1",
      localTaleId: "local-tale",
      remoteTaleId: REMOTE_ID,
      contentRev: "5",
      metadataRev: "5",
      lastSyncedAt: 1,
      pendingStatus: "idle",
      lastErrorCode: null,
    });
    const connection = transport();
    connection.get.mockResolvedValue(
      await encryptedDownload({
        taleId: REMOTE_ID,
        contentRev: 4,
        metadataRev: 6,
      }),
    );

    await expect(
      applyRemoteTalePackage({
        profile,
        transport: connection,
        localTaleId: "local-tale",
      }),
    ).rejects.toMatchObject({ code: "cloud_rollback" });
    expect(mocks.taleRepo.replaceTaleWithPackage).not.toHaveBeenCalled();
  });
});
