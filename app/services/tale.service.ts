import {
  createTale,
  updateTale,
  getTale,
  getTales,
  getScenarioTales,
  deleteTale,
} from "@/repositories/tale.repository";
import { useTaleStore } from "@/store/useTaleStore";
import { PaginatedResponse } from "@/types/db.type";
import { TaleHead } from "@/types/tale.type";

export async function initTale(
  scenarioId: string,
  thumbnail: Uint8Array | null,
): Promise<string> {
  const state = useTaleStore.getState();
  const id = await createTale({
    scenarioId,
    name: state.name,
    description: state.description,
    thumbnail,
    authorNote: state.authorNote,
    storyCards: state.storyCards,
    stats: state.stats,
    inventory: state.inventory,
    log: state.log,
    gameMode: state.gameMode,
    undoStack: state.undoStack,
  });
  useTaleStore.setState({ id });
  return id;
}

export async function persistCurrentTale(taleId: string): Promise<void> {
  const state = useTaleStore.getState();
  await updateTale({
    id: taleId,
    name: state.name,
    description: state.description,
    authorNote: state.authorNote,
    storyCards: state.storyCards,
    stats: state.stats,
    inventory: state.inventory,
    log: state.log,
    gameMode: state.gameMode,
    undoStack: state.undoStack,
    updatedAt: Date.now(),
  });
}

export async function loadTaleIntoGame(taleId: string): Promise<void> {
  const tale = await getTale(taleId);
  if (!tale) {
    throw new Error("Tale not found");
  }
  useTaleStore.setState({
    id: tale.id,
    name: tale.name,
    description: tale.description,
    authorNote: tale.authorNote,
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
    log: tale.log,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
  });
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
