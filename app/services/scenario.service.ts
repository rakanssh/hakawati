import {
  upsertScenario,
  getScenario,
  listScenarios,
  deleteScenario,
  getScenarios,
} from "@/repositories/scenario.repository";
import {
  markNewTaleSyncPreference,
  type NewTaleSyncPolicy,
} from "@/services/new-tale-sync";
import {
  legacyScenarioToContent,
  normalizeScenarioContent,
  scenarioContentToTaleSeed,
} from "@/lib/scenario-content";
import { normalizeStoryCard } from "@/lib/story-card-utils";
import {
  GameMode,
  Scenario,
  ScenarioHead,
  StorybookCategory,
} from "@/types/context.type";
import { initTale } from "./tale.service";
import { nanoid } from "nanoid";
import { PaginatedResponse } from "@/types/db.type";
import type {
  ScenarioExportV1,
  ScenarioExportV2,
  ScenarioExportV3,
} from "@/types/export.type";
import {
  ScenarioV1Schema,
  ScenarioV2Schema,
  ScenarioV3Schema,
} from "@/types/export.type";
import { LogEntryRole } from "@/types/log.type";

export async function saveScenario(
  scenario: Scenario,
  id?: string,
): Promise<string> {
  const normalized: Scenario = {
    id: scenario.id,
    name: (scenario.name ?? "").trim() || "Untitled Scenario",
    initialGameMode: scenario.initialGameMode,
    description: scenario.description ?? "",
    content: normalizeScenarioContent(scenario.content),
    thumbnail: scenario.thumbnail ?? null,
  };
  return upsertScenario(normalized, id);
}

export async function getScenarioById(id: string): Promise<Scenario | null> {
  const scenario = await getScenario(id);
  if (!scenario) return null;

  return scenario;
}

export async function listAllScenarios(): Promise<
  Array<{ id: string; scenario: Scenario; updatedAt: number }>
> {
  const scenarios = await listScenarios();
  return scenarios.map((item) => ({
    ...item,
  }));
}

export async function removeScenario(id: string): Promise<void> {
  return deleteScenario(id);
}

export async function getAllScenarios(
  page: number,
  limit: number,
): Promise<PaginatedResponse<ScenarioHead>> {
  return getScenarios(page, limit);
}

export async function initTaleFromScenario(
  scenarioId: string,
  options: { syncPolicy?: NewTaleSyncPolicy } = {},
): Promise<string> {
  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error("Scenario not found");
  const seed = scenarioContentToTaleSeed(scenario.content);
  // Copy scenario thumbnail into tale at creation time
  const taleId = await initTale({
    scenarioId,
    thumbnail: scenario.thumbnail ?? null,
    components: seed.components,
    storyCards: seed.storyCards,
    stats: seed.stats,
    inventory: seed.inventory,
    log: seed.openingText
      ? [
          {
            id: nanoid(12),
            text: seed.openingText,
            role: LogEntryRole.GM,
          },
        ]
      : [],
    gameMode: scenario.initialGameMode,
    undoStack: [],
    name: scenario.name,
    description: scenario.description,
  });
  await markNewTaleSyncPreference(taleId, options.syncPolicy);
  return taleId;
}

export function buildScenarioExportV3(scenario: Scenario): ScenarioExportV3 {
  const { thumbnail: _omitThumbnail, ...rest } = scenario;
  return {
    type: "hakawati.scenario",
    version: 3,
    exportedAt: new Date().toISOString(),
    data: {
      ...rest,
      content: normalizeScenarioContent(rest.content),
    },
  };
}

export const buildScenarioExportV2 = buildScenarioExportV3;

export function serializeScenarioExportV2(scenario: Scenario): string {
  const payload = buildScenarioExportV3(scenario);
  return JSON.stringify(payload, null, 2);
}

export function deserializeScenarioExport(json: string): Scenario {
  const raw = JSON.parse(json);
  if (raw?.version === 3) {
    const payload = ScenarioV3Schema.parse(raw as ScenarioExportV3);
    const scenario = payload.data as Scenario;
    return {
      ...scenario,
      content: normalizeScenarioContent(scenario.content),
      thumbnail: null,
    };
  }

  if (raw?.version === 2) {
    const payload = ScenarioV2Schema.parse(raw as ScenarioExportV2);
    const scenario = payload.data;
    return {
      id: scenario.id,
      name: scenario.name,
      initialGameMode:
        scenario.initialGameMode === GameMode.GM
          ? GameMode.GM
          : GameMode.STORY_TELLER,
      description: scenario.description,
      content: legacyScenarioToContent({
        ...scenario,
        initialStats: scenario.initialStats.map((stat) => ({
          ...stat,
          range: [stat.range[0] ?? 0, stat.range[1] ?? 100],
        })),
        initialStoryCards: scenario.initialStoryCards.map((card) =>
          normalizeStoryCard({
            ...card,
            category: card.category as StorybookCategory | undefined,
          }),
        ),
      }),
      thumbnail: null,
    };
  }

  const payload = ScenarioV1Schema.parse(raw as ScenarioExportV1);
  const data = payload.data;
  const gameMode =
    data.initialGameMode === GameMode.GM ? GameMode.GM : GameMode.STORY_TELLER;
  return {
    id: data.id ?? "",
    name: data.name,
    initialGameMode: gameMode,
    description: data.initialDescription,
    content: legacyScenarioToContent({
      description: data.initialDescription,
      initialAuthorNote: data.initialAuthorNote,
      openingText: data.openingText,
      initialStats: data.initialStats.map((stat) => ({
        ...stat,
        range: [stat.range[0] ?? 0, stat.range[1] ?? 100] as [number, number],
      })),
      initialInventory: data.initialInventory,
      initialStoryCards: data.initialStoryCards.map((card) => ({
        ...card,
        category: StorybookCategory.UNCATEGORIZED,
        isPinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
    }),
    thumbnail: null,
  };
}
