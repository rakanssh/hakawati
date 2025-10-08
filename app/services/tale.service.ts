import {
  createTale,
  updateTale,
  getTale,
  getTales,
  getScenarioTales,
  deleteTale,
} from "@/repositories/tale.repository";
import { PaginatedResponse } from "@/types/db.type";
import { createTaleDTO, TaleHead, updateTaleDTO } from "@/types/tale.type";

export async function initTale(tale: createTaleDTO): Promise<string> {
  const id = await createTale({
    scenarioId: tale.scenarioId,
    name: tale.name,
    description: tale.description,
    thumbnail: tale.thumbnail,
    authorNote: tale.authorNote,
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
    authorNote: tale.authorNote,
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
