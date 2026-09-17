import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  GameMode,
  PromptComponentType,
  type Scenario,
} from "@/types/context.type";
import { sha256Hex } from "@/lib/cover-image";
import type {
  CatalogScenarioDetail,
  ScenarioPackage,
} from "@/types/catalog.type";
import {
  acceptCurrentCatalogPolicies,
  blockCatalogPublisher,
  CatalogHttpError,
  createCatalogTransport,
  fetchCurrentCatalogPolicies,
  getCatalogScenario,
  getOwnedCatalogScenario,
  listCatalogScenarios,
  listCatalogTags,
  listOwnedCatalogScenarios,
  publishScenarioDraft,
  prepareScenarioPublishDraft,
  publishingAcceptanceFor,
  startCatalogScenario,
  uploadPublicCatalogThumbnail,
} from "./catalog.service";

const http = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

const coverImages = vi.hoisted(() => ({ optimize: vi.fn() }));

vi.mock("@/lib/cover-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cover-image")>()),
  optimizeCoverImage: coverImages.optimize,
}));

const taleService = vi.hoisted(() => ({
  initTale: vi.fn(),
}));

const newTaleSync = vi.hoisted(() => ({
  markNewTaleSyncPreference: vi.fn(),
}));

const publishLinks = vi.hoisted(() => ({
  getScenarioPublishLink: vi.fn(),
  upsertScenarioPublishLink: vi.fn(),
  getScenarioDraftCoverState: vi.fn(),
  initializeScenarioDraftCover: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: http.fetch,
}));

vi.mock("@/services/tale.service", () => taleService);
vi.mock("@/services/new-tale-sync", () => newTaleSync);
vi.mock("@/repositories/scenario-publish-link.repository", () => publishLinks);

const packageFixture = (): ScenarioPackage => ({
  format: "hakawati-scenario-package",
  formatVersion: 1,
  scenario: {
    title: "Iron Gate",
    summary: "A gate waits.",
    tags: ["gate"],
    initialGameMode: GameMode.STORY_TELLER,
    description: "A public scenario.",
    content: [
      {
        type: "prompt_component",
        version: 1,
        id: "opening",
        promptType: PromptComponentType.OPENING,
        content: "Rain needles the gate.",
      },
    ],
  },
});

const scenarioDetailFixture = (
  pkg = packageFixture(),
): CatalogScenarioDetail => ({
  id: "catalog-1",
  currentVersionId: "version-1",
  status: "published",
  title: pkg.scenario.title,
  summary: pkg.scenario.summary,
  tags: pkg.scenario.tags,
  author: { id: "author-1", displayName: "Author" },
  thumbnail: null,
  viewCount: 0,
  startCount: 0,
  updatedAt: "2026-09-16T00:00:00Z",
  publishedAt: "2026-09-16T00:00:00Z",
  package: pkg,
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe("catalog service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coverImages.optimize.mockReset();
  });

  it("uses optimized bytes for the catalog upload, hash, dimensions and quota request", async () => {
    const source = {
      bytes: new Uint8Array(100),
      contentType: "image/png" as const,
    };
    const bytes = new Uint8Array([5, 6, 7]);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    coverImages.optimize.mockResolvedValue({
      bytes,
      contentType: "image/webp",
      width: 1280,
      height: 800,
    });
    const transport = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi
        .fn()
        .mockResolvedValueOnce({
          asset: { assetId: "cover-1" },
          upload: { url: "https://storage.example/cover-1", headers: {} },
        })
        .mockResolvedValueOnce({ asset: { assetId: "cover-1" } }),
    };
    http.fetch.mockResolvedValueOnce({ ok: true });
    await expect(
      uploadPublicCatalogThumbnail(transport, source),
    ).resolves.toEqual({ assetId: "cover-1" });
    expect(coverImages.optimize).toHaveBeenCalledWith(source);
    expect(transport.post).toHaveBeenNthCalledWith(
      1,
      "/v1/assets/cover-upload-intents",
      {
        visibility: "public",
        contentType: "image/webp",
        byteSize: 3,
        sha256,
        width: 1280,
        height: 800,
      },
    );
    const body = http.fetch.mock.calls[0][1].body as Blob;
    expect(body.type).toBe("image/webp");
    expect(body.size).toBe(3);
    expect(transport.post).toHaveBeenNthCalledWith(
      2,
      "/v1/assets/cover-1/complete",
      {},
    );
    expect(source.bytes.byteLength).toBe(100);
  });

  it("does not reserve cloud storage when cover optimization fails", async () => {
    coverImages.optimize.mockRejectedValueOnce(
      new Error("Invalid cover image"),
    );
    const transport = { get: vi.fn(), patch: vi.fn(), post: vi.fn() };
    await expect(
      uploadPublicCatalogThumbnail(transport, {
        bytes: new Uint8Array([1]),
        contentType: "image/png",
      }),
    ).rejects.toThrow("Invalid cover image");
    expect(transport.post).not.toHaveBeenCalled();
    expect(http.fetch).not.toHaveBeenCalled();
  });

  it("blocks a catalog publisher", async () => {
    const transport = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn().mockResolvedValue({
        publisherId: "publisher-1",
        blocked: true,
      }),
    };

    await expect(
      blockCatalogPublisher(transport, "publisher-1"),
    ).resolves.toEqual({ publisherId: "publisher-1", blocked: true });
    expect(transport.post).toHaveBeenCalledWith(
      "/v1/catalog/publishers/publisher-1/block",
      {},
    );
  });

  it("creates a local tale from catalog start without saving a local scenario", async () => {
    taleService.initTale.mockResolvedValueOnce("local-tale");
    const transport = {
      get: vi.fn().mockResolvedValue(scenarioDetailFixture()),
      patch: vi.fn(),
      post: vi.fn().mockResolvedValueOnce({
        scenario: packageFixture().scenario,
        source: {
          type: "catalog",
          catalogScenarioId: "catalog-1",
          catalogScenarioVersionId: "version-1",
          title: "Iron Gate",
        },
        package: packageFixture(),
      }),
    };

    await expect(
      startCatalogScenario(transport, "catalog-1", { syncPolicy: "private" }),
    ).resolves.toBe("local-tale");

    expect(taleService.initTale).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          type: "catalog",
          scenarioId: "catalog-1",
          scenarioVersionId: "version-1",
          scenarioTitle: "Iron Gate",
        },
        name: "Iron Gate",
        log: [
          expect.objectContaining({
            text: "Rain needles the gate.",
          }),
        ],
      }),
    );
    expect(newTaleSync.markNewTaleSyncPreference).toHaveBeenCalledWith(
      "local-tale",
      "private",
    );
    expect(transport.post).toHaveBeenCalledWith(
      "/v1/catalog/scenarios/catalog-1/start",
      { expectedVersionId: "version-1" },
    );
  });

  it("keeps answers on the client and resolves the approved public version", async () => {
    const pkg = packageFixture();
    pkg.scenario.content[0] = {
      type: "prompt_component",
      version: 1,
      id: "opening",
      promptType: PromptComponentType.OPENING,
      content: "${Name?} is a ${Role? | choices: Mage, Scout}.",
    };
    const snapshot = scenarioDetailFixture(pkg);
    const transport = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn().mockResolvedValue({
        package: pkg,
        source: {
          type: "catalog",
          catalogScenarioId: "catalog-1",
          catalogScenarioVersionId: "version-1",
          title: "Iron Gate",
        },
      }),
    };
    taleService.initTale.mockResolvedValueOnce("custom-tale");
    await startCatalogScenario(transport, snapshot.id, {
      scenarioSnapshot: snapshot,
      answers: { "Name?": "${Literal answer}", "Role?": "Mage" },
    });
    expect(transport.get).not.toHaveBeenCalled();
    expect(transport.post).toHaveBeenCalledWith(
      "/v1/catalog/scenarios/catalog-1/start",
      { expectedVersionId: "version-1" },
    );
    expect(taleService.initTale).toHaveBeenCalledWith(
      expect.objectContaining({
        log: [
          expect.objectContaining({ text: "${Literal answer} is a Mage." }),
        ],
      }),
    );
    expect(snapshot.package.scenario.content[0]).toMatchObject({
      content: "${Name?} is a ${Role? | choices: Mage, Scout}.",
    });
  });

  it("rejects missing answers and resolved content beyond existing limits before a public start", async () => {
    const pkg = packageFixture();
    pkg.scenario.content[0] = {
      type: "prompt_component",
      version: 1,
      id: "opening",
      promptType: PromptComponentType.OPENING,
      content: "${Name?}",
    };
    const scenarioSnapshot = scenarioDetailFixture(pkg);
    const transport = { get: vi.fn(), patch: vi.fn(), post: vi.fn() };
    await expect(
      startCatalogScenario(transport, scenarioSnapshot.id, {
        scenarioSnapshot,
      }),
    ).rejects.toThrow();
    await expect(
      startCatalogScenario(transport, scenarioSnapshot.id, {
        scenarioSnapshot,
        answers: { "Name?": "x".repeat(8001) },
      }),
    ).rejects.toThrow();
    expect(transport.post).not.toHaveBeenCalled();
    expect(taleService.initTale).not.toHaveBeenCalled();
  });

  it("does not save a tale if the version changed while answering", async () => {
    const scenarioSnapshot = scenarioDetailFixture();
    const transport = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new CatalogHttpError(
            "Scenario updated",
            409,
            "scenario_version_changed",
          ),
        ),
    };
    await expect(
      startCatalogScenario(transport, scenarioSnapshot.id, {
        scenarioSnapshot,
      }),
    ).rejects.toMatchObject({ code: "scenario_version_changed" });
    expect(taleService.initTale).not.toHaveBeenCalled();
    expect(newTaleSync.markNewTaleSyncPreference).not.toHaveBeenCalled();
    transport.post.mockResolvedValue({
      package: packageFixture(),
      source: { catalogScenarioVersionId: "other-version" },
    });
    await expect(
      startCatalogScenario(transport, scenarioSnapshot.id, {
        scenarioSnapshot,
      }),
    ).rejects.toMatchObject({ code: "scenario_version_changed" });
    expect(taleService.initTale).not.toHaveBeenCalled();
  });

  it("blocks publishing invalid questions before making network requests", async () => {
    const pkg = packageFixture();
    pkg.scenario.content[0] = {
      type: "prompt_component",
      version: 1,
      id: "opening",
      promptType: PromptComponentType.OPENING,
      content: "${Role? | invalid: Mage}",
    };
    const transport = { get: vi.fn(), patch: vi.fn(), post: vi.fn() };
    await expect(
      publishScenarioDraft({
        transport,
        localScenarioId: "local-1",
        scenario: {
          id: "local-1",
          name: "Gate",
          description: "Gate",
          initialGameMode: GameMode.STORY_TELLER,
          content: pkg.scenario.content,
        },
        metadata: { tags: ["gate"] },
      }),
    ).rejects.toThrow();
    expect(transport.post).not.toHaveBeenCalled();
    expect(publishLinks.upsertScenarioPublishLink).not.toHaveBeenCalled();
  });

  it("publishes local drafts through package endpoints and stores the link", async () => {
    publishLinks.getScenarioPublishLink.mockResolvedValueOnce(null);
    const transport = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn().mockResolvedValueOnce({
        id: "catalog-1",
        currentVersionId: "version-1",
      }),
    };

    await publishScenarioDraft({
      transport,
      localScenarioId: "local-1",
      scenario: {
        id: "local-1",
        name: "Iron Gate",
        initialGameMode: GameMode.STORY_TELLER,
        description: "A public scenario.",
        thumbnail: null,
        content: packageFixture().scenario.content,
      },
      metadata: { tags: ["gate"] },
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/catalog/scenarios",
      expect.objectContaining({
        package: expect.objectContaining({
          format: "hakawati-scenario-package",
          scenario: expect.objectContaining({
            content: packageFixture().scenario.content,
            tags: ["gate"],
          }),
        }),
      }),
    );
    const payload = transport.post.mock.calls[0][1] as {
      package: ScenarioPackage;
    };
    expect("language" in payload.package.scenario).toBe(false);
    expect("ageRating" in payload.package.scenario).toBe(false);
    expect(publishLinks.upsertScenarioPublishLink).toHaveBeenCalledWith({
      localScenarioId: "local-1",
      catalogScenarioId: "catalog-1",
      catalogScenarioVersionId: "version-1",
      draftCoverInitialized: true,
    });
  });

  it("publishes updates through the versions endpoint when a local link exists", async () => {
    publishLinks.getScenarioPublishLink.mockResolvedValueOnce({
      localScenarioId: "local-1",
      catalogScenarioId: "catalog-1",
      catalogScenarioVersionId: "version-1",
      lastPublishedAt: 1,
    });
    const transport = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn().mockResolvedValueOnce({
        id: "catalog-1",
        currentVersionId: "version-2",
      }),
    };

    await publishScenarioDraft({
      transport,
      localScenarioId: "local-1",
      scenario: {
        id: "local-1",
        name: "Updated Iron Gate",
        initialGameMode: GameMode.STORY_TELLER,
        description: "The latest draft description.",
        thumbnail: null,
        content: packageFixture().scenario.content,
      },
      metadata: { tags: ["gate"] },
      thumbnailAssetId: null,
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/catalog/scenarios/catalog-1/versions",
      expect.objectContaining({
        thumbnailAssetId: null,
        package: expect.objectContaining({
          scenario: expect.objectContaining({
            title: "Updated Iron Gate",
            summary: "The latest draft description.",
            description: "The latest draft description.",
          }),
        }),
      }),
    );
  });

  describe("legacy published cover recovery", () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const draft = (): Scenario => ({
      id: "local-1",
      name: "My current name",
      description: "My current description",
      initialGameMode: GameMode.STORY_TELLER,
      content: packageFixture().scenario.content,
      thumbnail: null,
    });
    const link = {
      localScenarioId: "local-1",
      catalogScenarioId: "catalog-1",
      draftCoverInitialized: false,
    };

    async function recoveryTransport() {
      const detail = {
        ...scenarioDetailFixture(),
        thumbnail: {
          assetId: "cover-1",
          visibility: "public",
          contentType: "image/png",
          byteSize: bytes.length,
          sha256: await sha256Hex(bytes),
          width: 1,
          height: 1,
          downloadUrl: "https://storage.example/cover-1",
          urlExpiresAt: null,
        },
      };
      return {
        get: vi.fn().mockResolvedValue(detail),
        post: vi.fn(),
        patch: vi.fn(),
      };
    }

    beforeEach(() => {
      publishLinks.getScenarioPublishLink.mockResolvedValue(link);
      publishLinks.getScenarioDraftCoverState.mockResolvedValue({
        thumbnail: null,
        updatedAt: 123,
      });
      publishLinks.initializeScenarioDraftCover.mockImplementation(
        async ({ thumbnail }) => thumbnail,
      );
    });

    it("restores a verified public-only cover without replacing current draft text", async () => {
      const transport = await recoveryTransport();
      http.fetch.mockResolvedValueOnce(new Response(bytes));
      const result = await prepareScenarioPublishDraft(draft(), transport);
      expect(result.scenario).toEqual({ ...draft(), thumbnail: bytes });
      expect(result.published?.tags).toEqual(["gate"]);
      expect(publishLinks.initializeScenarioDraftCover).toHaveBeenCalledWith({
        localScenarioId: "local-1",
        catalogScenarioId: "catalog-1",
        expectedUpdatedAt: 123,
        thumbnail: bytes,
      });
    });

    it("keeps a deliberate cover removal after initialization", async () => {
      publishLinks.getScenarioPublishLink.mockResolvedValue({
        ...link,
        draftCoverInitialized: true,
      });
      const result = await prepareScenarioPublishDraft(
        draft(),
        await recoveryTransport(),
      );
      expect(result.scenario.thumbnail).toBeNull();
      expect(http.fetch).not.toHaveBeenCalled();
      expect(publishLinks.initializeScenarioDraftCover).not.toHaveBeenCalled();
    });

    it("keeps an existing local cover without downloading the older public cover", async () => {
      publishLinks.getScenarioDraftCoverState.mockResolvedValue({
        thumbnail: bytes,
        updatedAt: 123,
      });
      const result = await prepareScenarioPublishDraft(
        draft(),
        await recoveryTransport(),
      );
      expect(result.scenario.thumbnail).toEqual(bytes);
      expect(http.fetch).not.toHaveBeenCalled();
    });

    it.each(["checksum", "size", "format"])(
      "does not initialize after invalid cover %s",
      async (invalid) => {
        const transport = await recoveryTransport();
        const downloaded = bytes.slice();
        if (invalid === "checksum") downloaded[8] = 2;
        if (invalid === "format") downloaded[0] = 0;
        http.fetch.mockResolvedValueOnce(
          new Response(
            invalid === "size" ? new Uint8Array(bytes.length + 1) : downloaded,
          ),
        );
        await expect(
          prepareScenarioPublishDraft(draft(), transport),
        ).rejects.toThrow(/published cover/);
        expect(
          publishLinks.initializeScenarioDraftCover,
        ).not.toHaveBeenCalled();
      },
    );

    it("leaves an unpublished local draft alone", async () => {
      publishLinks.getScenarioPublishLink.mockResolvedValue(null);
      const transport = await recoveryTransport();
      await expect(
        prepareScenarioPublishDraft(draft(), transport),
      ).resolves.toEqual({ scenario: draft(), published: null });
      expect(transport.get).not.toHaveBeenCalled();
    });
  });

  it("throws generic HTTP status errors from server failures", async () => {
    http.fetch.mockResolvedValueOnce(
      jsonResponse(
        { type: "invalid_scenario_package", message: "Bad" },
        false,
        400,
      ),
    );

    await expect(
      createCatalogTransport({ baseUrl: "https://cloud.example/v1" }).post(
        "/v1/catalog/scenarios",
        {},
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_scenario_package",
    } satisfies Partial<CatalogHttpError>);
  });

  it("preserves structured API error details", async () => {
    http.fetch.mockResolvedValueOnce(
      jsonResponse(
        {
          code: "policy_acceptance_required",
          message: "Accept policies.",
          details: { missingPolicies: ["terms"] },
          requestId: "request-1",
        },
        false,
        409,
      ),
    );

    await expect(
      createCatalogTransport({ baseUrl: "https://cloud.example" }).post(
        "/v1/catalog/scenarios",
        {},
      ),
    ).rejects.toMatchObject({
      code: "policy_acceptance_required",
      details: { missingPolicies: ["terms"] },
      requestId: "request-1",
    });
  });

  it("loads and accepts the server's current publishing policy versions", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({
        policies: [
          {
            key: "terms",
            version: "2026-09-12",
            url: "https://hakawati.dev/terms",
            requiredForPublishing: true,
          },
          {
            key: "community_guidelines",
            version: "2026-09-12",
            url: "https://hakawati.dev/community-guidelines",
            requiredForPublishing: true,
          },
        ],
        publishingRequires: ["terms", "community_guidelines"],
      }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    const current = await fetchCurrentCatalogPolicies(transport);
    const acceptance = publishingAcceptanceFor(current);
    await acceptCurrentCatalogPolicies(transport, acceptance);

    expect(transport.post).toHaveBeenCalledWith("/v1/policy-acceptances", {
      termsVersion: "2026-09-12",
      communityGuidelinesVersion: "2026-09-12",
    });
  });

  it("combines title search, pagination, ordering and normalized tag filters", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({ items: [], nextCursor: null }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    await listCatalogScenarios(transport, {
      q: "  Iron & Gate  ",
      limit: 12,
      cursor: "next page",
      sort: "popular",
      tag: ["Sci Fi", "scripted"],
    });

    expect(transport.get).toHaveBeenCalledWith(
      "/v1/catalog/scenarios?limit=12&cursor=next+page&q=Iron+%26+Gate&sort=popular&tag=sci-fi&tag=scripted",
    );
  });

  it("sends repeated tag filters when listing owned catalog scenarios", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({ items: [], nextCursor: null }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    await listOwnedCatalogScenarios(transport, {
      q: "  Iron Gate  ",
      sort: "updated",
      tag: ["Sci Fi", "scripted"],
    });

    expect(transport.get).toHaveBeenCalledWith(
      "/v1/catalog/me/scenarios?q=Iron+Gate&sort=updated&tag=sci-fi&tag=scripted",
    );
  });

  it("accepts moderation on owned catalog scenario list responses", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({
        items: [
          {
            id: "catalog-1",
            currentVersionId: "version-1",
            status: "hidden",
            title: "Iron Gate",
            summary: "A gate waits.",
            tags: ["gate"],
            author: { id: "author-1", displayName: "Rakan" },
            thumbnail: null,
            viewCount: 0,
            startCount: 0,
            updatedAt: "2026-07-01T00:00:00.000Z",
            publishedAt: "2026-07-01T00:00:00.000Z",
            moderation: {
              status: "rejected",
              reason: "Blocked by catalog moderation.",
              moderatedAt: "2026-07-01T00:01:00.000Z",
            },
          },
        ],
        nextCursor: null,
      }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    await expect(listOwnedCatalogScenarios(transport)).resolves.toMatchObject({
      items: [
        {
          moderation: {
            status: "rejected",
            reason: "Blocked by catalog moderation.",
          },
        },
      ],
    });
  });

  it("loads owned catalog details through the owned endpoint", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({
        id: "catalog-1",
        currentVersionId: "version-1",
        status: "hidden",
        title: "Iron Gate",
        summary: "A gate waits.",
        tags: ["gate"],
        author: { id: "author-1", displayName: "Rakan" },
        thumbnail: null,
        viewCount: 0,
        startCount: 0,
        updatedAt: "2026-07-01T00:00:00.000Z",
        publishedAt: "2026-07-01T00:00:00.000Z",
        moderation: {
          status: "rejected",
          reason: "Blocked by catalog moderation.",
          moderatedAt: "2026-07-01T00:01:00.000Z",
        },
        package: packageFixture(),
      }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    await getOwnedCatalogScenario(transport, "catalog-1");

    expect(transport.get).toHaveBeenCalledWith(
      "/v1/catalog/me/scenarios/catalog-1",
    );
  });

  it("does not require moderation on public catalog details", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({
        id: "catalog-1",
        currentVersionId: "version-1",
        status: "published",
        title: "Iron Gate",
        summary: "A gate waits.",
        tags: ["gate"],
        author: { id: "author-1", displayName: "Rakan" },
        thumbnail: null,
        viewCount: 0,
        startCount: 0,
        updatedAt: "2026-07-01T00:00:00.000Z",
        publishedAt: "2026-07-01T00:00:00.000Z",
        package: packageFixture(),
      }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    const detail = await getCatalogScenario(transport, "catalog-1");

    expect("moderation" in detail).toBe(false);
  });

  it("lists tag suggestions with refinement filters", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({
        items: [{ tag: "sci-fi", count: 50 }],
      }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    await expect(
      listCatalogTags(transport, {
        q: "sc",
        search: "  Iron Gate  ",
        tag: ["Scripted"],
        sort: "hot",
        limit: 20,
      }),
    ).resolves.toEqual({ items: [{ tag: "sci-fi", count: 50 }] });
    expect(transport.get).toHaveBeenCalledWith(
      "/v1/catalog/tags?q=sc&search=Iron+Gate&sort=hot&limit=20&tag=scripted",
    );
  });
});
