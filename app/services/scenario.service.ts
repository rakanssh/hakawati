import {
  upsertScenario,
  getScenario,
  listScenarios,
  deleteScenario,
  getScenarios,
} from "@/repositories/scenario.repository";
import {
  Scenario,
  ScenarioHead,
  StoryCard,
  StorybookCategory,
} from "@/types/context.type";
import { initTale } from "./tale.service";
import { nanoid } from "nanoid";
import { PaginatedResponse } from "@/types/db.type";
import type { ScenarioExportV1 } from "@/types/export.type";
import { ScenarioV1Schema } from "@/types/export.type";
import { LogEntryRole } from "@/types/log.type";

/**
 * Normalizes a story card by applying default values for missing fields.
 */
function normalizeStoryCard(card: StoryCard): StoryCard {
  const now = Date.now();
  return {
    id: card.id,
    title: card.title,
    triggers: card.triggers || [],
    content: card.content,
    category: card.category || StorybookCategory.UNCATEGORIZED,
    isPinned: card.isPinned || false,
    createdAt: card.createdAt || now,
    updatedAt: card.updatedAt || now,
  };
}

export async function saveScenario(
  scenario: Scenario,
  id?: string,
): Promise<string> {
  const normalized: Scenario = {
    id: scenario.id,
    name: (scenario.name ?? "").trim() || "Untitled Scenario",
    initialGameMode: scenario.initialGameMode,
    initialDescription: scenario.initialDescription ?? "",
    initialAuthorNote: scenario.initialAuthorNote ?? "",
    initialStats: scenario.initialStats ?? [],
    initialInventory: scenario.initialInventory ?? [],
    initialStoryCards: scenario.initialStoryCards ?? [],
    thumbnail: scenario.thumbnail ?? null,
    openingText: scenario.openingText ?? "",
  };
  return upsertScenario(normalized, id);
}

export async function getScenarioById(id: string): Promise<Scenario | null> {
  const scenario = await getScenario(id);
  if (!scenario) return null;

  return {
    ...scenario,
    initialStoryCards: scenario.initialStoryCards.map(normalizeStoryCard),
  };
}

export async function createScenario(scenario: Scenario): Promise<string> {
  return upsertScenario(scenario);
}

export async function listAllScenarios(): Promise<
  Array<{ id: string; scenario: Scenario; updatedAt: number }>
> {
  const scenarios = await listScenarios();
  return scenarios.map((item) => ({
    ...item,
    scenario: {
      ...item.scenario,
      initialStoryCards:
        item.scenario.initialStoryCards.map(normalizeStoryCard),
    },
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
): Promise<string> {
  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error("Scenario not found");
  // Copy scenario thumbnail into tale at creation time
  return initTale({
    scenarioId,
    thumbnail: scenario.thumbnail ?? null,
    authorNote: scenario.initialAuthorNote ?? "",
    storyCards: scenario.initialStoryCards.map(normalizeStoryCard),
    stats: scenario.initialStats,
    inventory: scenario.initialInventory.map((name) => ({
      id: nanoid(12),
      name,
    })),
    log: scenario.openingText
      ? [
          {
            id: nanoid(12),
            text: scenario.openingText,
            role: LogEntryRole.GM,
          },
        ]
      : [],
    gameMode: scenario.initialGameMode,
    undoStack: [],
    name: scenario.name,
    description: scenario.initialDescription,
  });
}

export function buildScenarioExportV1(scenario: Scenario): ScenarioExportV1 {
  const { thumbnail: _omitThumbnail, ...rest } = scenario;
  return {
    type: "hakawati.scenario",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: rest,
  };
}

export function serializeScenarioExportV1(scenario: Scenario): string {
  const payload = buildScenarioExportV1(scenario);
  console.debug("Serialized scenario", payload);
  return JSON.stringify(payload, null, 2);
}

export function deserializeScenarioExportV1(json: string): Scenario {
  const payload = ScenarioV1Schema.parse(JSON.parse(json) as ScenarioExportV1);
  console.debug("Deserialized scenario", payload);
  const scenario = payload.data as Scenario;
  return {
    ...scenario,
    initialStoryCards: scenario.initialStoryCards.map(normalizeStoryCard),
  };
}
