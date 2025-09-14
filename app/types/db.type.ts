export type ScenarioRow = {
  id: string;
  name: string;
  initial_game_mode: string;
  initial_description: string;
  initial_author_note: string;
  initial_stats: string;
  initial_inventory: string;
  initial_story_cards: string;
  opening_text: string;
  thumbnail_data?: Uint8Array | null;
  created_at: number;
  updated_at: number;
};

export type TaleRow = {
  id: string;
  name: string;
  description: string;
  thumbnail_data?: Uint8Array | null;
  author_note: string;
  story_cards: string;
  scenario_id: string | null;
  stats: string;
  inventory: string;
  log: string;
  game_mode: string;
  undo_stack: string;
  created_at: number;
  updated_at: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};
