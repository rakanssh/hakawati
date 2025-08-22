import {
  createSave,
  updateSave,
  getSave,
  getSaves,
  getScenarioSaves,
} from "@/repositories/save.repository";
import { useGameStore } from "@/store/useGameStore";
import { PaginatedResponse } from "@/types/db.type";
import { SaveHead } from "@/types/save.type";

export async function createGameSave(
  scenarioId: string,
  saveName: string,
): Promise<string> {
  const state = useGameStore.getState();
  const id = await createSave({
    scenarioId,
    saveName,
    stats: state.stats,
    inventory: state.inventory,
    log: state.log,
    gameMode: state.gameMode,
  });
  useGameStore.setState({ id });
  return id;
}

export async function updateGameSave(saveName: string): Promise<void> {
  const state = useGameStore.getState();
  await updateSave({
    id: state.id,
    saveName,
    stats: state.stats,
    inventory: state.inventory,
    log: state.log,
    gameMode: state.gameMode,
  });
}

export async function loadSaveIntoGame(saveId: string): Promise<void> {
  const save = await getSave(saveId);
  if (!save) {
    throw new Error("Save not found");
  }
  useGameStore.setState({
    id: save.id,
    stats: save.stats,
    inventory: save.inventory,
    log: save.log,
    gameMode: save.gameMode,
    // keep existing createdAt in DB; store doesn't hold timestamps
    undoStack: [],
  });
}

export async function getAllSaves(
  page: number,
  limit: number,
): Promise<PaginatedResponse<SaveHead>> {
  return getSaves(page, limit);
}

export async function getSavesForScenario(
  scenarioId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<SaveHead>> {
  return getScenarioSaves(scenarioId, page, limit);
}
