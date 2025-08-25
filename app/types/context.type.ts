import { Stat } from "./stats.type";

export type Scenario = {
  id: string;
  name: string;
  initialDescription: string;
  initialAuthorNote: string;
  initialStats: Stat[];
  initialInventory: string[];
  initialStoryCards: StoryCard[];
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
