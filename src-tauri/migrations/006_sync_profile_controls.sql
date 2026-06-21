ALTER TABLE sync_profiles
ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE sync_profiles
ADD COLUMN disabled_reason TEXT CHECK (
    disabled_reason IN ('device_limit', 'signed_out', 'user_disabled')
);

CREATE TABLE
    IF NOT EXISTS tale_sync_preferences (
        profile_id TEXT,
        local_tale_id TEXT NOT NULL,
        policy TEXT NOT NULL CHECK (policy IN ('sync', 'private')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (profile_id, local_tale_id),
        FOREIGN KEY (profile_id) REFERENCES sync_profiles (id) ON DELETE CASCADE,
        FOREIGN KEY (local_tale_id) REFERENCES tales (id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_tale_sync_preferences_policy ON tale_sync_preferences (
    profile_id,
    policy
);
