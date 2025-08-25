export type ScenarioRow = {
  id: string;
  name: string;
  description: string;
  author_note: string;
  initial_stats: string;
  initial_inventory: string;
  initial_story_cards: string;
  created_at: number;
  updated_at: number;
};

export type SaveRow = {
  id: string;
  scenario_id: string;
  save_name: string;
  stats: string;
  inventory: string;
  log: string;
  created_at: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};
