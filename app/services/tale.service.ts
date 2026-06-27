import {
  appendTurn,
  createTale,
  exportTalePackage,
  importTalePackage,
  replaceLogEntryInTurn,
  replaceTurnContainingEntries,
  trimLogToEntryCount,
  updateLogEntry as updateStoredLogEntry,
  updateTaleCurrentData,
  getTale,
  getTalePlayLoad,
  getTales,
  getScenarioTales,
  deleteTale,
  linkTaleToScenario,
  type TalePlayLoad,
} from "@/repositories/tale.repository";
import { saveScenario } from "@/services/scenario.service";
import { PaginatedResponse } from "@/types/db.type";
import { createTaleDTO, Tale, TaleHead } from "@/types/tale.type";
import { PromptComponentType, Scenario } from "@/types/context.type";
import type { LogEntry } from "@/types/log.type";
import type { TalePackageV1 } from "@/types/export.type";
import { TalePackageV1Schema } from "@/types/export.type";
import { normalizePromptComponents } from "@/lib/prompt-components";
import { normalizeStoryCard } from "@/lib/story-card-utils";
import {
  createTaleCurrentState,
  createTaleSessionState,
} from "@/lib/tale-storage";

export type TaleMutableSnapshot = Pick<
  Tale,
  | "name"
  | "description"
  | "components"
  | "storyCards"
  | "stats"
  | "inventory"
  | "gameMode"
  | "undoStack"
>;

export type PlayTaleLoad = TalePlayLoad;

function currentStateFromSnapshot(tale: TaleMutableSnapshot) {
  return createTaleCurrentState({
    components: normalizePromptComponents(tale.components),
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
  });
}

function sessionFromSnapshot(tale: TaleMutableSnapshot) {
  return createTaleSessionState({ undoStack: tale.undoStack });
}

export async function initTale(tale: createTaleDTO): Promise<string> {
  const id = await createTale({
    scenarioId: tale.scenarioId,
    name: tale.name,
    description: tale.description,
    thumbnail: tale.thumbnail,
    components: normalizePromptComponents(tale.components),
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
  tale: TaleMutableSnapshot;
}): Promise<void> {
  await updateTaleCurrentData({
    id,
    name: tale.name,
    description: tale.description,
    components: normalizePromptComponents(tale.components),
    storyCards: tale.storyCards,
    stats: tale.stats,
    inventory: tale.inventory,
    gameMode: tale.gameMode,
    undoStack: tale.undoStack,
    updatedAt: Date.now(),
  });
}

export async function commitTaleTurn({
  id,
  tale,
  entries,
  createdAt = Date.now(),
}: {
  id: string;
  tale: TaleMutableSnapshot;
  entries: LogEntry[];
  createdAt?: number;
}): Promise<void> {
  await appendTurn(
    id,
    { entries, createdAt },
    currentStateFromSnapshot(tale),
    sessionFromSnapshot(tale),
  );
}

export async function completePendingTaleTurn({
  id,
  tale,
  pendingEntries,
  entries,
  createdAt = Date.now(),
  fallbackToAppend = false,
}: {
  id: string;
  tale: TaleMutableSnapshot;
  pendingEntries: LogEntry[];
  entries: LogEntry[];
  createdAt?: number;
  fallbackToAppend?: boolean;
}): Promise<void> {
  try {
    await replaceTurnContainingEntries(
      id,
      pendingEntries.map((entry) => entry.id),
      { entries, createdAt },
      currentStateFromSnapshot(tale),
      sessionFromSnapshot(tale),
    );
  } catch (error) {
    if (
      !fallbackToAppend ||
      !(error instanceof Error) ||
      !error.message.includes("not found")
    ) {
      throw error;
    }
    await commitTaleTurn({ id, tale, entries, createdAt });
  }
}

export async function retryTaleTurn({
  id,
  tale,
  previousEntries,
  entries,
  createdAt = Date.now(),
}: {
  id: string;
  tale: TaleMutableSnapshot;
  previousEntries: LogEntry[];
  entries: LogEntry[];
  createdAt?: number;
}): Promise<void> {
  await replaceTurnContainingEntries(
    id,
    previousEntries.map((entry) => entry.id),
    { entries, createdAt },
    currentStateFromSnapshot(tale),
    sessionFromSnapshot(tale),
  );
}

export async function undoTaleLogToEntryCount({
  id,
  tale,
  entryCount,
}: {
  id: string;
  tale: TaleMutableSnapshot;
  entryCount: number;
}): Promise<void> {
  await trimLogToEntryCount(
    id,
    entryCount,
    currentStateFromSnapshot(tale),
    sessionFromSnapshot(tale),
  );
}

export async function editTaleLogEntry({
  id,
  entryId,
  patch,
}: {
  id: string;
  tale: TaleMutableSnapshot;
  entryId: string;
  patch: Partial<Omit<LogEntry, "id">>;
}): Promise<void> {
  await updateStoredLogEntry(id, entryId, patch);
}

export async function retryTaleLogEntry({
  id,
  tale,
  previousEntry,
  replacementEntry,
}: {
  id: string;
  tale: TaleMutableSnapshot;
  previousEntry: LogEntry;
  replacementEntry: LogEntry;
}): Promise<void> {
  await replaceLogEntryInTurn(
    id,
    previousEntry.id,
    replacementEntry,
    currentStateFromSnapshot(tale),
    sessionFromSnapshot(tale),
  );
}

export async function redoTaleLogEntry({
  id,
  tale,
  entry,
  createdAt = Date.now(),
}: {
  id: string;
  tale: TaleMutableSnapshot;
  entry: LogEntry;
  createdAt?: number;
}): Promise<void> {
  await appendTurn(
    id,
    { entries: [entry], createdAt },
    currentStateFromSnapshot(tale),
    sessionFromSnapshot(tale),
  );
}

export async function getTaleById(taleId: string) {
  const INITIAL_WINDOW = 200;
  const tale = await getTalePlayLoad(taleId, {
    logLimit: INITIAL_WINDOW,
  });

  if (!tale) return null;

  return {
    ...tale,
    components: normalizePromptComponents(tale.components),
    storyCards: tale.storyCards.map(normalizeStoryCard),
    log: tale.log,
    totalLogCount: tale.totalLogCount,
    oldestLoadedIndex: tale.oldestLoadedIndex,
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

export async function saveAsScenario(taleId: string): Promise<string> {
  const tale = await getTale(taleId);
  if (!tale) throw new Error("Tale not found");
  if (tale.scenarioId) throw new Error("Tale already has a scenario");

  const scenario: Scenario = {
    id: "",
    name: tale.name,
    initialGameMode: tale.gameMode,
    description: tale.description,
    components: normalizePromptComponents(
      tale.components.filter(
        (component) => component.type !== PromptComponentType.OPENING,
      ),
    ),
    initialStats: tale.stats,
    initialInventory: tale.inventory.map((item) => item.name),
    initialStoryCards: tale.storyCards.map(normalizeStoryCard),
    thumbnail: tale.thumbnail,
  };

  const scenarioId = await saveScenario(scenario);
  await linkTaleToScenario(taleId, scenarioId);

  return scenarioId;
}

export async function buildTalePackage(taleId: string): Promise<TalePackageV1> {
  return exportTalePackage(taleId);
}

export async function serializeTalePackage(taleId: string): Promise<string> {
  const payload = await buildTalePackage(taleId);
  return JSON.stringify(payload, null, 2);
}

export function deserializeTalePackage(json: string): TalePackageV1 {
  return TalePackageV1Schema.parse(JSON.parse(json)) as TalePackageV1;
}

export async function importTalePackageJson(
  json: string,
  options?: { preserveId?: boolean; title?: string },
): Promise<string> {
  return importTalePackage(deserializeTalePackage(json), options);
}
