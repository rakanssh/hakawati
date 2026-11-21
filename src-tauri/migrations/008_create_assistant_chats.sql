CREATE TABLE IF NOT EXISTS assistant_threads (
    id TEXT PRIMARY KEY NOT NULL,
    tale_id TEXT NULL REFERENCES tales(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assistant_threads_updated
ON assistant_threads (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_threads_tale
ON assistant_threads (tale_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
    id TEXT PRIMARY KEY NOT NULL,
    thread_id TEXT NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    images_json TEXT NULL,
    thinking TEXT NULL,
    turn_json TEXT NULL,
    activity_json TEXT NULL,
    changes_json TEXT NULL,
    status TEXT NULL,
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_messages_thread_seq
ON assistant_messages (thread_id, seq);
