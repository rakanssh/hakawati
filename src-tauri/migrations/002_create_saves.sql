CREATE TABLE
    IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        scenario_id TEXT,
        save_name TEXT NOT NULL,
        stats TEXT NOT NULL,
        inventory TEXT NOT NULL,
        log TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE SET NULL
    );