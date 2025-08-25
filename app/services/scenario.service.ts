import {
  upsertScenario,
  getScenario,
  listScenarios,
  deleteScenario,
} from "@/repositories/scenario.repository";
import { Scenario } from "@/types/context.type";
import { useTaleStore } from "@/store/useTaleStore";
import { initTale } from "./tale.service";

export async function saveScenario(
  scenario: Scenario,
  id?: string,
): Promise<string> {
  return upsertScenario(scenario, id);
}

export async function getScenarioById(id: string): Promise<Scenario | null> {
  return getScenario(id);
}

export async function createScenario(scenario: Scenario): Promise<string> {
  return upsertScenario(scenario);
}

export async function listAllScenarios(): Promise<
  Array<{ id: string; scenario: Scenario; updatedAt: number }>
> {
  return listScenarios();
}

export async function removeScenario(id: string): Promise<void> {
  return deleteScenario(id);
}

export async function initTaleFromScenario(
  scenarioId: string,
): Promise<string> {
  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error("Scenario not found");
  // Seed tale store with scenario initial data
  useTaleStore.setState({
    name: scenario.name,
    description: scenario.initialDescription,
    authorNote: scenario.initialAuthorNote,
    stats: scenario.initialStats,
    inventory: (scenario.initialInventory ?? []).map((name) => ({
      id: name,
      name,
    })),
    storyCards: scenario.initialStoryCards,
    log: [],
  });
  return initTale(scenarioId);
}
