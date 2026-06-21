import {
  upsertScenario,
  getScenario,
  listScenarios,
  deleteScenario,
  getScenarios,
} from "@/repositories/scenario.repository";
import {
  getPromptComponentContent,
  normalizePromptComponents,
  TALE_COMPONENT_TYPES,
} from "@/lib/prompt-components";
import { normalizeStoryCard } from "@/lib/story-card-utils";
import {
  markNewTaleSyncPreference,
  type NewTaleSyncPolicy,
} from "@/services/new-tale-sync";
import {
  GameMode,
  PromptComponentType,
  Scenario,
  ScenarioHead,
  StorybookCategory,
} from "@/types/context.type";
import { initTale } from "./tale.service";
import { nanoid } from "nanoid";
import { PaginatedResponse } from "@/types/db.type";
import type { ScenarioExportV1, ScenarioExportV2 } from "@/types/export.type";
import { ScenarioV1Schema, ScenarioV2Schema } from "@/types/export.type";
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
    components: normalizePromptComponents(
      scenario.components,
      Object.values(PromptComponentType),
    ),
    initialStats: scenario.initialStats ?? [],
    initialInventory: scenario.initialInventory ?? [],
    initialStoryCards: scenario.initialStoryCards ?? [],
    thumbnail: scenario.thumbnail ?? null,
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
  options: { syncPolicy?: NewTaleSyncPolicy } = {},
): Promise<string> {
  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error("Scenario not found");
  const components = normalizePromptComponents(
    scenario.components.filter(
      (component) => component.type !== PromptComponentType.OPENING,
    ),
    TALE_COMPONENT_TYPES,
  );
  const openingText = getPromptComponentContent(
    scenario.components,
    PromptComponentType.OPENING,
  );
  // Copy scenario thumbnail into tale at creation time
  const taleId = await initTale({
    scenarioId,
    thumbnail: scenario.thumbnail ?? null,
    components,
    storyCards: scenario.initialStoryCards.map(normalizeStoryCard),
    stats: scenario.initialStats,
    inventory: scenario.initialInventory.map((name) => ({
      id: nanoid(12),
      name,
    })),
    log: openingText
      ? [
          {
            id: nanoid(12),
            text: openingText,
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

export function buildScenarioExportV2(scenario: Scenario): ScenarioExportV2 {
  const { thumbnail: _omitThumbnail, ...rest } = scenario;
  return {
    type: "hakawati.scenario",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: rest,
  };
}

export function serializeScenarioExportV2(scenario: Scenario): string {
  const payload = buildScenarioExportV2(scenario);
  return JSON.stringify(payload, null, 2);
}

export function deserializeScenarioExport(json: string): Scenario {
  const raw = JSON.parse(json);
  if (raw?.version === 2) {
    const payload = ScenarioV2Schema.parse(raw as ScenarioExportV2);
    const scenario = payload.data as Scenario;
    return {
      ...scenario,
      components: normalizePromptComponents(scenario.components),
      initialStoryCards: scenario.initialStoryCards.map(normalizeStoryCard),
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
    components: normalizePromptComponents([
      {
        id: nanoid(12),
        type: PromptComponentType.PLOT,
        content: data.initialDescription,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: nanoid(12),
        type: PromptComponentType.AUTHOR_NOTE,
        content: data.initialAuthorNote,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: nanoid(12),
        type: PromptComponentType.OPENING,
        content: data.openingText,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]),
    initialStats: data.initialStats.map((stat) => ({
      ...stat,
      range: [stat.range[0] ?? 0, stat.range[1] ?? 100] as [number, number],
    })),
    initialInventory: data.initialInventory,
    initialStoryCards: data.initialStoryCards.map((card) =>
      normalizeStoryCard({
        ...card,
        category: StorybookCategory.UNCATEGORIZED,
        isPinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ),
  };
}
