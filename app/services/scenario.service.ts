import {
  upsertScenario,
  getScenario,
  listScenarios,
  deleteScenario,
  getScenarios,
} from "@/repositories/scenario.repository";
import { Scenario, ScenarioHead } from "@/types/context.type";
import { useTaleStore } from "@/store/useTaleStore";
import { initTale } from "./tale.service";
import { nanoid } from "nanoid";
import { PaginatedResponse } from "@/types/db.type";

export async function saveScenario(
  scenario: Scenario,
  id?: string,
): Promise<string> {
  const normalized: Scenario = {
    id: scenario.id,
    name: (scenario.name ?? "").trim() || "Untitled Scenario",
    initialGameMode: scenario.initialGameMode,
    initialDescription: scenario.initialDescription ?? "",
    initialAuthorNote: scenario.initialAuthorNote ?? "",
    initialStats: scenario.initialStats ?? [],
    initialInventory: scenario.initialInventory ?? [],
    initialStoryCards: scenario.initialStoryCards ?? [],
    thumbnail: scenario.thumbnail ?? null,
  };
  return upsertScenario(normalized, id);
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

export async function getAllScenarios(
  page: number,
  limit: number,
): Promise<PaginatedResponse<ScenarioHead>> {
  return getScenarios(page, limit);
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
      id: nanoid(12),
      name,
    })),
    storyCards: scenario.initialStoryCards,
    log: [],
  });
  // Copy scenario thumbnail into tale at creation time
  return initTale(scenarioId, scenario.thumbnail ?? null);
}
