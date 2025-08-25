import {
  upsertScenario,
  getScenario,
} from "@/repositories/scenario.repository";
import { useScenarioStore } from "@/store/useScenarioStore";
import { Scenario } from "@/types/context.type";
import { useGameStore } from "@/store/useGameStore";

export async function saveScenarioFromStore(id?: string): Promise<string> {
  const { scenario } = useScenarioStore.getState();
  const { storyCards } = useGameStore.getState();
  const fullScenario: Scenario = {
    ...scenario,
    initialStoryCards: storyCards,
  };
  return upsertScenario(fullScenario, id);
}

export async function loadScenarioIntoStore(id: string): Promise<void> {
  const scenario = await getScenario(id);
  if (!scenario) {
    throw new Error("Scenario not found");
  }
  useScenarioStore.setState({
    scenario: {
      id: scenario.id,
      name: scenario.name,
      initialDescription: scenario.initialDescription,
      initialAuthorNote: scenario.initialAuthorNote,
      initialStats: scenario.initialStats,
      initialInventory: scenario.initialInventory,
      initialStoryCards: scenario.initialStoryCards,
    },
  });
}

export async function createScenario(scenario: Scenario): Promise<string> {
  return upsertScenario(scenario);
}
