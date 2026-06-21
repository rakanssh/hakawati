CREATE TABLE
    IF NOT EXISTS sync_profiles (
        id TEXT PRIMARY KEY,
        base_url TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('hosted', 'personal')),
        device_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

CREATE TABLE
    IF NOT EXISTS tale_sync_state (
        profile_id TEXT NOT NULL,
        local_tale_id TEXT NOT NULL,
        remote_tale_id TEXT NOT NULL,
        content_rev TEXT,
        metadata_rev TEXT,
        last_synced_at INTEGER,
        pending_status TEXT NOT NULL DEFAULT 'idle' CHECK (
            pending_status IN ('idle', 'push', 'pull', 'conflict', 'error')
        ),
        last_error_code TEXT,
        PRIMARY KEY (profile_id, local_tale_id),
        FOREIGN KEY (profile_id) REFERENCES sync_profiles (id) ON DELETE CASCADE,
        FOREIGN KEY (local_tale_id) REFERENCES tales (id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_tale_sync_state_status ON tale_sync_state (
    profile_id,
    pending_status
);
