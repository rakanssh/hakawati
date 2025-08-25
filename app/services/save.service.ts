import {
  createSave,
  getSave,
  getSaves,
  getScenarioSaves,
} from "@/repositories/save.repository";
import { useGameStore } from "@/store/useGameStore";
import { PaginatedResponse } from "@/types/db.type";
import { SaveHead } from "@/types/save.type";

export async function saveCurrentGame(
  scenarioId: string,
  saveName: string,
): Promise<string> {
  const state = useGameStore.getState();
  return createSave({
    scenarioId,
    saveName,
    stats: state.stats,
    inventory: state.inventory,
    log: state.log,
  });
}

export async function loadSaveIntoGame(saveId: string): Promise<void> {
  const save = await getSave(saveId);
  if (!save) {
    throw new Error("Save not found");
  }
  useGameStore.setState({
    stats: save.stats,
    inventory: save.inventory,
    log: save.log,
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
