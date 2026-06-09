import {
  createTale,
  updateTale,
  getTale,
  getTales,
  getScenarioTales,
  deleteTale,
  linkTaleToScenario,
} from "@/repositories/tale.repository";
import { saveScenario } from "@/services/scenario.service";
import { PaginatedResponse } from "@/types/db.type";
import { createTaleDTO, TaleHead, updateTaleDTO } from "@/types/tale.type";
import {
  PromptComponentType,
  StoryCard,
  StorybookCategory,
  Scenario,
} from "@/types/context.type";
import { normalizePromptComponents } from "@/lib/prompt-components";

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

export async function initTale(tale: createTaleDTO): Promise<string> {
  const id = await createTale({
    scenarioId: tale.scenarioId,
    name: tale.name,
    description: tale.description,
    thumbnail: tale.thumbnail,
    components: normalizePromptComponents(tale.components),
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
    log: tale.log,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
  });
  return id;
}

export async function persistCurrentTale({
  id,
  tale,
  oldestLoadedIndex,
  totalLogCount,
}: {
  id: string;
  tale: updateTaleDTO;
  oldestLoadedIndex?: number;
  totalLogCount?: number;
}): Promise<void> {
  let completeLog = tale.log;

  if (
    oldestLoadedIndex !== undefined &&
    totalLogCount !== undefined &&
    oldestLoadedIndex > 0
  ) {
    try {
      const currentTale = await getTale(id);

      if (currentTale?.log) {
        const dbLog = currentTale.log;
        const beforeWindow = dbLog.slice(0, oldestLoadedIndex);
        completeLog = [...beforeWindow, ...tale.log];
      }
    } catch (error) {
      console.error("Failed to merge windowed log with database log:", error);
      throw error;
    }
  }

  // Strip token cache before persisting
  const cleanLog = completeLog.map((entry) => {
    const { _tokenCount, ...cleanEntry } = entry;
    return cleanEntry;
  });

  await updateTale({
    id,
    name: tale.name,
    description: tale.description,
    components: normalizePromptComponents(tale.components),
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
    log: cleanLog,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
    updatedAt: Date.now(),
  });
}

export async function getTaleById(taleId: string) {
  const tale = await getTale(taleId);

  if (!tale) return null;

  const INITIAL_WINDOW = 200;
  const totalCount = tale.log.length;
  const startIndex = Math.max(0, totalCount - INITIAL_WINDOW);

  return {
    ...tale,
    components: normalizePromptComponents(tale.components),
    storyCards: tale.storyCards.map(normalizeStoryCard),
    log: tale.log.slice(startIndex),
    totalLogCount: totalCount,
    oldestLoadedIndex: startIndex,
  };
}

export async function getAllTales(
  page: number,
  limit: number,
): Promise<PaginatedResponse<TaleHead>> {
  return getTales(page, limit);
}

export async function getTalesForScenario(
  scenarioId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<TaleHead>> {
  return getScenarioTales(scenarioId, page, limit);
}

export async function deleteTaleById(id: string): Promise<void> {
  return deleteTale(id);
}

export async function saveAsScenario(taleId: string): Promise<string> {
  const tale = await getTale(taleId);
  if (!tale) throw new Error("Tale not found");
  if (tale.scenarioId) throw new Error("Tale already has a scenario");

  const scenario: Scenario = {
    id: "",
    name: tale.name,
    initialGameMode: tale.gameMode,
    description: tale.description,
    components: normalizePromptComponents(
      tale.components.filter(
        (component) => component.type !== PromptComponentType.OPENING,
      ),
    ),
    initialStats: tale.stats,
    initialInventory: tale.inventory.map((item) => item.name),
    initialStoryCards: tale.storyCards.map(normalizeStoryCard),
    thumbnail: tale.thumbnail,
  };

  const scenarioId = await saveScenario(scenario);
  await linkTaleToScenario(taleId, scenarioId);

  return scenarioId;
}
