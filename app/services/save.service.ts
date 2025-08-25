import { createSave, getSave } from "@/repositories/save.repository";
import { useGameStore } from "@/store/useGameStore";

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
