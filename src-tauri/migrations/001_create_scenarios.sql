CREATE TABLE
    IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        thumbnail_data BLOB,
        initial_game_mode TEXT NOT NULL DEFAULT 'story_teller',
        initial_description TEXT NOT NULL,
        initial_author_note TEXT NOT NULL,
        initial_stats TEXT NOT NULL,
        initial_inventory TEXT NOT NULL,
        initial_story_cards TEXT NOT NULL,
        opening_text TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_scenarios_updated_at ON scenarios (updated_at DESC);