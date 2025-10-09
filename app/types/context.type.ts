import { Stat } from "./stats.type";

export type Scenario = {
  id: string;
  name: string;
  initialGameMode: GameMode;
  initialDescription: string;
  initialAuthorNote: string;
  initialStats: Stat[];
  initialInventory: string[];
  initialStoryCards: StoryCard[];
  openingText?: string;
  thumbnail?: Uint8Array | null;
};

export type ScenarioHead = {
  id: string;
  name: string;
  initialGameMode: GameMode;
  initialDescription: string;
  updatedAt: number;
  thumbnail?: Uint8Array | null;
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
