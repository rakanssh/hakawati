import { describe, expect, it, vi, beforeEach } from "vitest";
import { GameMode, PromptComponentType } from "@/types/context.type";
import type { ScenarioPackage } from "@/types/catalog.type";
import {
  CatalogHttpError,
  createCatalogTransport,
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
    language: "en",
    category: "fantasy",
    tags: ["gate"],
    ageRating: "general",
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
      metadata: { summary: "A gate waits.", category: "fantasy" },
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/catalog/scenarios",
      expect.objectContaining({
        package: expect.objectContaining({
          format: "hakawati-scenario-package",
          scenario: expect.objectContaining({
            content: packageFixture().scenario.content,
          }),
        }),
      }),
    );
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
      metadata: { summary: "A gate waits." },
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
});
