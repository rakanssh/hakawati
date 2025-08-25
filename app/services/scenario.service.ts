import {
  upsertScenario,
  getScenario,
} from "@/repositories/scenario.repository";
import { useScenarioStore } from "@/store/useScenarioStore";
import { Scenario } from "@/types/context.type";

export async function saveScenarioFromStore(id?: string): Promise<string> {
  const { scenario, storyCards } = useScenarioStore.getState();
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
      description: scenario.description,
      authorNote: scenario.authorNote,
      initialStats: scenario.initialStats,
      initialInventory: scenario.initialInventory,
      initialStoryCards: scenario.initialStoryCards,
    },
    storyCards: scenario.initialStoryCards,
  });
}

export async function createScenario(scenario: Scenario): Promise<string> {
  return upsertScenario(scenario);
}
