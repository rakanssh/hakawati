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
  thumbnailWebp?: Uint8Array | null;
};

export type ScenarioHead = {
  id: string;
  name: string;
  initialGameMode: GameMode;
  initialDescription: string;
  updatedAt: number;
  thumbnailWebp?: Uint8Array | null;
};

export type StoryCard = {
  id: string;
  title: string;
  triggers: string[];
  content: string;
};

export type StoryCardInput = Omit<StoryCard, "id">;

export enum GameMode {
  GM = "gm",
  STORY_TELLER = "story_teller",
}
