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
}: {
  id: string;
  tale: updateTaleDTO;
}): Promise<void> {
  await updateTale({
    id,
    name: tale.name,
    description: tale.description,
    authorNote: tale.authorNote,
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
    log: tale.log,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
    updatedAt: Date.now(),
  });
}

export async function getTaleById(taleId: string) {
  return getTale(taleId);
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
