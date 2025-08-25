CREATE TABLE
    IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        author_note TEXT NOT NULL,
        story_cards TEXT NOT NULL,
        scenario_id TEXT,
        save_name TEXT NOT NULL,
        stats TEXT NOT NULL,
        inventory TEXT NOT NULL,
        log TEXT NOT NULL,
        game_mode TEXT NOT NULL DEFAULT 'gm',
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime ('%s', 'now') * 1000),
        FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE SET NULL
    );