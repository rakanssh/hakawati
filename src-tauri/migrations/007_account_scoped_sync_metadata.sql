DROP TABLE IF EXISTS tale_sync_state;
DROP TABLE IF EXISTS tale_sync_preferences;

CREATE TABLE tale_sync_state (
    profile_id TEXT NOT NULL,
    account_id TEXT NOT NULL DEFAULT '',
    local_tale_id TEXT NOT NULL,
    remote_tale_id TEXT NOT NULL,
    content_rev TEXT,
    metadata_rev TEXT,
    last_synced_at INTEGER,
    pending_status TEXT NOT NULL DEFAULT 'idle' CHECK (
        pending_status IN ('idle', 'push', 'pull', 'conflict', 'error')
    ),
    last_error_code TEXT,
    PRIMARY KEY (profile_id, account_id, local_tale_id),
    FOREIGN KEY (profile_id) REFERENCES sync_profiles (id) ON DELETE CASCADE,
    FOREIGN KEY (local_tale_id) REFERENCES tales (id) ON DELETE CASCADE
);

CREATE INDEX idx_tale_sync_state_status ON tale_sync_state (
    profile_id,
    account_id,
    pending_status
);

CREATE TABLE tale_sync_preferences (
    profile_id TEXT,
    account_id TEXT NOT NULL DEFAULT '',
    local_tale_id TEXT NOT NULL,
    policy TEXT NOT NULL CHECK (policy IN ('sync', 'private')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, account_id, local_tale_id),
    FOREIGN KEY (profile_id) REFERENCES sync_profiles (id) ON DELETE CASCADE,
    FOREIGN KEY (local_tale_id) REFERENCES tales (id) ON DELETE CASCADE
);

CREATE INDEX idx_tale_sync_preferences_policy ON tale_sync_preferences (
    profile_id,
    account_id,
    policy
);
