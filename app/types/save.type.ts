import { Stat } from "./stats.type";
import { Item, LogEntry } from "./index";
import { GameMode, StoryCard } from "./context.type";

export type Save = {
  id: string;
  name: string;
  description: string;
  authorNote: string;
  storyCards: StoryCard[];
  scenarioId: string | null;
  saveName: string;
  stats: Stat[];
  inventory: Item[];
  log: LogEntry[];
  gameMode: GameMode;
  createdAt: number;
  updatedAt: number;
};

export type SaveHead = {
  id: string;
  saveName: string;
  createdAt: number;
  scenarioId: string | null;
  updatedAt: number;
};
