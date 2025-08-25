import { Stat } from "./stats.type";
import { Item, LogEntry } from "./index";

export type Save = {
  id: string;
  scenarioId: string;
  saveName: string;
  stats: Stat[];
  inventory: Item[];
  log: LogEntry[];
  createdAt: number;
};
