import { describe, expect, it, vi, beforeEach } from "vitest";
import { GameMode, PromptComponentType } from "@/types/context.type";
import type { ScenarioPackage } from "@/types/catalog.type";
import {
  CatalogHttpError,
  createCatalogTransport,
  getCatalogScenario,
  getOwnedCatalogScenario,
  listCatalogScenarios,
  listCatalogTags,
  listOwnedCatalogScenarios,
  publishScenarioDraft,
  startCatalogScenario,
} from "./catalog.service";

const http = vi.hoisted(() => ({
  fetch: vi.fn(),
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
  });

  it("creates a local tale from catalog start without saving a local scenario", async () => {
    taleService.initTale.mockResolvedValueOnce("local-tale");
    const transport = {
      get: vi.fn(),
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
      metadata: { summary: "A gate waits.", tags: ["gate"] },
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
        name: "Iron Gate",
        initialGameMode: GameMode.STORY_TELLER,
        description: "A public scenario.",
        thumbnail: null,
        content: packageFixture().scenario.content,
      },
      metadata: { summary: "A gate waits.", tags: ["gate"] },
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/catalog/scenarios/catalog-1/versions",
      expect.any(Object),
    );
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

  it("sends repeated tag filters when listing catalog scenarios", async () => {
    const transport = {
      get: vi.fn().mockResolvedValueOnce({ items: [], nextCursor: null }),
      patch: vi.fn(),
      post: vi.fn(),
    };

    await listCatalogScenarios(transport, {
      sort: "popular",
      tag: ["Sci Fi", "scripted"],
    });

    expect(transport.get).toHaveBeenCalledWith(
      "/v1/catalog/scenarios?sort=popular&tag=sci-fi&tag=scripted",
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
            author: { displayName: "Rakan" },
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
        author: { displayName: "Rakan" },
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
        author: { displayName: "Rakan" },
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
        tag: ["Scripted"],
        sort: "hot",
        limit: 20,
      }),
    ).resolves.toEqual({ items: [{ tag: "sci-fi", count: 50 }] });
    expect(transport.get).toHaveBeenCalledWith(
      "/v1/catalog/tags?q=sc&sort=hot&limit=20&tag=scripted",
    );
  });
});
