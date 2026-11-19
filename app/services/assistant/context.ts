import { useTaleStore } from "@/store/useTaleStore";
import {
  GameMode,
  LogEntryRole,
  PromptComponentType,
  type Item,
  type LogEntry,
  type PromptComponent,
  type StoryCard,
} from "@/types";
import type { Stat } from "@/types/stats.type";

export type AssistantPage =
  | "home"
  | "tales"
  | "scenarios"
  | "scenario"
  | "scenario_editor"
  | "new_scenario"
  | "catalog_scenario"
  | "quickstart"
  | "play";

export function describeRoute(pathname: string): {
  page: AssistantPage;
  scenarioId?: string;
} {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/play")) return { page: "play" };
  if (path === "/tales") return { page: "tales" };
  if (path === "/quickstart") return { page: "quickstart" };
  if (path === "/scenarios") return { page: "scenarios" };
  if (path === "/scenarios/new") return { page: "new_scenario" };
  const catalog = /^\/scenarios\/catalog\/([^/]+)$/.exec(path);
  if (catalog) return { page: "catalog_scenario", scenarioId: catalog[1] };
  const editor = /^\/scenarios\/([^/]+)\/edit$/.exec(path);
  if (editor) return { page: "scenario_editor", scenarioId: editor[1] };
  const details = /^\/scenarios\/([^/]+)$/.exec(path);
  if (details) return { page: "scenario", scenarioId: details[1] };
  return { page: "home" };
}

/** The tale open on the play screen, whose live state is in the tale store. */
export function openTaleId(pathname: string): string | null {
  if (describeRoute(pathname).page !== "play") return null;
  return useTaleStore.getState().id || null;
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function describePassage(entry: LogEntry, index: number) {
  const byPlayer = entry.role === LogEntryRole.PLAYER;
  return {
    id: entry.id,
    index,
    by: byPlayer ? "player" : "narrator",
    ...(byPlayer && entry.mode ? { mode: entry.mode } : {}),
    text: entry.text,
  };
}

const componentText = (
  components: PromptComponent[],
  type: PromptComponentType,
) => components.find((component) => component.type === type)?.content ?? "";

export function describeTaleSetup(tale: {
  name: string;
  description: string;
  gameMode: GameMode;
  components: PromptComponent[];
  storyCards: StoryCard[];
  stats: Stat[];
  inventory: Item[];
}) {
  const gm = tale.gameMode === GameMode.GM;
  return {
    name: tale.name,
    description: tale.description,
    mode: gm ? "game_master" : "story_teller",
    plot: componentText(tale.components, PromptComponentType.PLOT),
    authorNote: componentText(tale.components, PromptComponentType.AUTHOR_NOTE),
    aiInstructions: clip(
      componentText(tale.components, PromptComponentType.AI_INSTRUCTIONS),
      4000,
    ),
    storyCards: tale.storyCards.map((card) => ({
      id: card.id,
      title: card.title,
      category: card.category,
      triggers: card.triggers,
      pinned: card.isPinned,
      content: card.content,
    })),
    ...(gm
      ? {
          stats: tale.stats.map((stat) => ({
            name: stat.name,
            value: stat.value,
            range: stat.range,
            ...(stat.description ? { description: stat.description } : {}),
          })),
          inventory: tale.inventory.map((item) => ({
            id: item.id,
            name: item.name,
            ...(item.description ? { description: item.description } : {}),
          })),
        }
      : {}),
  };
}

const RECENT_PASSAGES = 8;

/** Where the player is and what is open, attached to their newest message. */
export function workspaceContext(pathname: string) {
  const route = describeRoute(pathname);
  const taleId = openTaleId(pathname);
  if (!taleId) return route;
  const tale = useTaleStore.getState();
  const start = tale.oldestLoadedIndex;
  const recent = tale.log
    .map((entry, offset) => ({ entry, index: start + offset }))
    .filter(({ entry }) => entry.text.trim())
    .slice(-RECENT_PASSAGES);
  return {
    ...route,
    openTale: {
      id: taleId,
      name: tale.name,
      mode: tale.gameMode === GameMode.GM ? "game_master" : "story_teller",
      passages: tale.totalLogCount,
      storyCards: tale.storyCards.map((card) => card.title),
      ...(tale.gameMode === GameMode.GM
        ? {
            stats: tale.stats.map((s) => `${s.name} ${s.value}`),
            inventory: tale.inventory.map((item) => item.name),
          }
        : {}),
      recentPassages: recent.map(({ entry, index }) => ({
        ...describePassage(entry, index),
        text: clip(entry.text, 600),
      })),
    },
  };
}
