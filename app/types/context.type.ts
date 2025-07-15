import { Stat } from "./stats.type";

export type Scenario = {
  name: string;
  description: string;
  authorNote: string;
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
