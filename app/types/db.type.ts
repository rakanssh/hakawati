export type ScenarioRow = {
  id: string;
  name: string;
  initial_game_mode: string;
  initial_description: string;
  initial_author_note: string;
  initial_stats: string;
  initial_inventory: string;
  initial_story_cards: string;
  components?: string | null;
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
  components?: string | null;
  story_cards: string;
  scenario_id: string | null;
  stats: string;
  inventory: string;
  log: string;
  game_mode: string;
  save_version?: number;
  schema_version?: number;
  log_count?: number;
  last_log_entry_json?: string | null;
  undo_stack: string;
  created_at: number;
  updated_at: number;
};

export type TaleStateRow = {
  tale_id: string;
  state_json: string;
  state_schema_version: number;
  updated_at: number;
};

export type TaleTurnRow = {
  id: string;
  tale_id: string;
  seq: number;
  entries_json: string;
  entry_start_index: number;
  entry_count: number;
  created_at: number;
  updated_at: number;
};

export type TaleSessionRow = {
  tale_id: string;
  undo_stack_json: string;
  editor_state_json: string;
  updated_at: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};
