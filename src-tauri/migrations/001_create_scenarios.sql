CREATE TABLE
    IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        author_note TEXT NOT NULL,
        initial_stats TEXT NOT NULL,
        initial_inventory TEXT NOT NULL,
        initial_story_cards TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );