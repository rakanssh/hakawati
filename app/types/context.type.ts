import { Stat } from "./stats.type";

export type Scenario = {
  id: string;
  name: string;
  initialGameMode: GameMode;
  description: string;
  components: PromptComponent[];
  initialStats: Stat[];
  initialInventory: string[];
  initialStoryCards: StoryCard[];
  thumbnail?: Uint8Array | null;
};

export type ScenarioHead = {
  id: string;
  name: string;
  initialGameMode: GameMode;
  description: string;
  updatedAt: number;
  thumbnail?: Uint8Array | null;
};

export enum PromptComponentType {
  AI_INSTRUCTIONS = "ai_instructions",
  PLOT = "plot",
  AUTHOR_NOTE = "author_note",
  OPENING = "opening",
}

export type PromptComponent = {
  id: string;
  type: PromptComponentType;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export enum StorybookCategory {
  CHARACTER = "Character",
  THING = "Thing",
  PLACE = "Place",
  CONCEPT = "Concept",
  UNCATEGORIZED = "Uncategorized",
}

export type StoryCard = {
  id: string;
  title: string;
  triggers: string[];
  content: string;
  category: StorybookCategory;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
};

export type StoryCardInput = Omit<StoryCard, "id" | "createdAt" | "updatedAt">;

export enum GameMode {
  GM = "gm",
  STORY_TELLER = "story_teller",
}
