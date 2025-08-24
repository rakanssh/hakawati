CREATE TABLE
    IF NOT EXISTS tales (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        author_note TEXT NOT NULL,
        story_cards TEXT NOT NULL,
        scenario_id TEXT,
        stats TEXT NOT NULL,
        inventory TEXT NOT NULL,
        log TEXT NOT NULL,
        game_mode TEXT NOT NULL DEFAULT 'gm',
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime ('%s', 'now') * 1000),
        FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE SET NULL
    );

CREATE INDEX IF NOT EXISTS idx_tales_created_at ON tales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tales_scenario_id_created_at ON tales (scenario_id, created_at DESC);

