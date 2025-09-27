import { Stat } from "./stats.type";
import { Item, LogEntry } from "./index";
import { GameMode, ScenarioHead, StoryCard } from "./context.type";

export type Tale = {
  id: string;
  name: string;
  description: string;
  thumbnail: Uint8Array | null;
  authorNote: string;
  storyCards: StoryCard[];
  scenarioId?: string;
  stats: Stat[];
  inventory: Item[];
  log: LogEntry[];
  gameMode: GameMode;
  undoStack: LogEntry[];
  createdAt: number;
  updatedAt: number;
};

export type createTaleDTO = Omit<Tale, "id" | "createdAt" | "updatedAt">;
export type updateTaleDTO = Omit<Tale, "createdAt" | "updatedAt">;
export type TaleHead = {
  id: string;
  name: string;
  description: string;
  thumbnail?: Uint8Array | null;
  createdAt: number;
  scenarioId: string | null;
  logCount: number;
  updatedAt: number;
  lastLogEntry: LogEntry | null;
  scenarioHead?: ScenarioHead | null;
};
