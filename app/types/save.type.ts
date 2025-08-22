import { Stat } from "./stats.type";
import { Item, LogEntry } from "./index";
import { GameMode } from "./context.type";

export type Save = {
  id: string;
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
