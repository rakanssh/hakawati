import { Stat } from "./stats.type";
import { Item, LogEntry } from "./index";
import {
  GameMode,
  PromptComponent,
  ScenarioHead,
  StoryCard,
} from "./context.type";

export type TaleSourceMetadata = {
  type: "local" | "catalog";
  scenarioId: string;
  scenarioVersionId?: string | null;
  scenarioTitle?: string | null;
};

export type Tale = {
  id: string;
  name: string;
  description: string;
  thumbnail: Uint8Array | null;
  components: PromptComponent[];
  storyCards: StoryCard[];
  scenarioId?: string;
  source?: TaleSourceMetadata;
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
  source?: TaleSourceMetadata;
  logCount: number;
  updatedAt: number;
  lastLogEntry: LogEntry | null;
  scenarioHead?: ScenarioHead | null;
};
