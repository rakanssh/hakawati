CREATE TABLE
    IF NOT EXISTS sync_pending_writes (
        profile_id TEXT NOT NULL,
        account_id TEXT NOT NULL DEFAULT '',
        write_key TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('POST', 'PUT')),
        path TEXT NOT NULL,
        body TEXT NOT NULL,
        save_version INTEGER,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (profile_id, account_id, write_key),
        FOREIGN KEY (profile_id) REFERENCES sync_profiles (id) ON DELETE CASCADE
    );
