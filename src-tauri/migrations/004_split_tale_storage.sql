ALTER TABLE tales ADD COLUMN save_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE tales ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE tales ADD COLUMN log_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tales ADD COLUMN last_log_entry_json TEXT;

CREATE TABLE
    IF NOT EXISTS tale_states (
        tale_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        state_schema_version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (strftime ('%s', 'now') * 1000),
        FOREIGN KEY (tale_id) REFERENCES tales (id) ON DELETE CASCADE
    );

CREATE TABLE
    IF NOT EXISTS tale_turns (
        id TEXT PRIMARY KEY,
        tale_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        entries_json TEXT NOT NULL,
        entry_start_index INTEGER NOT NULL DEFAULT 0,
        entry_count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime ('%s', 'now') * 1000),
        FOREIGN KEY (tale_id) REFERENCES tales (id) ON DELETE CASCADE,
        UNIQUE (tale_id, seq)
    );

CREATE TABLE
    IF NOT EXISTS tale_sessions (
        tale_id TEXT PRIMARY KEY,
        undo_stack_json TEXT NOT NULL DEFAULT '[]',
        editor_state_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL DEFAULT (strftime ('%s', 'now') * 1000),
        FOREIGN KEY (tale_id) REFERENCES tales (id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_tale_turns_tale_seq ON tale_turns (tale_id, seq);

CREATE INDEX IF NOT EXISTS idx_tale_turns_tale_created_at ON tale_turns (tale_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tale_turns_tale_entry_window ON tale_turns (
    tale_id,
    entry_start_index,
    entry_count
);

INSERT OR IGNORE INTO tale_states (
    tale_id,
    state_json,
    state_schema_version,
    updated_at
)
SELECT
    id,
    json_object(
        'components',
        CASE
            WHEN json_valid (components)
            AND json_type (components) = 'array' THEN json (components)
            ELSE json_array()
        END,
        'storyCards',
        CASE
            WHEN json_valid (story_cards)
            AND json_type (story_cards) = 'array' THEN json (story_cards)
            ELSE json_array()
        END,
        'gm',
        json_object(
            'stats',
            CASE
                WHEN json_valid (stats)
                AND json_type (stats) = 'array' THEN json (stats)
                ELSE json_array()
            END,
            'inventory',
            CASE
                WHEN json_valid (inventory)
                AND json_type (inventory) = 'array' THEN json (inventory)
                ELSE json_array()
            END,
            'scratchpad',
            json_object()
        )
    ),
    1,
    updated_at
FROM tales;

INSERT OR IGNORE INTO tale_sessions (
    tale_id,
    undo_stack_json,
    editor_state_json,
    updated_at
)
SELECT
    id,
    CASE
        WHEN json_valid (undo_stack)
        AND json_type (undo_stack) = 'array' THEN undo_stack
        ELSE '[]'
    END,
    '{}',
    updated_at
FROM tales;

INSERT OR IGNORE INTO tale_turns (
    id,
    tale_id,
    seq,
    entries_json,
    entry_start_index,
    entry_count,
    created_at,
    updated_at
)
SELECT
    lower(hex(randomblob(16))),
    t.id,
    CAST(j.key AS INTEGER) + 1,
    json_array(json(j.value)),
    CAST(j.key AS INTEGER),
    1,
    COALESCE(
        json_extract(j.value, '$.createdAt'),
        t.created_at + CAST(j.key AS INTEGER)
    ),
    t.updated_at
FROM tales t,
    json_each(
        CASE
            WHEN json_valid (t.log)
            AND json_type (t.log) = 'array' THEN t.log
            ELSE '[]'
        END
    ) AS j
WHERE NOT EXISTS (
    SELECT 1
    FROM tale_turns existing
    WHERE existing.tale_id = t.id
);

UPDATE tales
SET
    log_count = CASE
        WHEN json_valid (log)
        AND json_type (log) = 'array' THEN COALESCE(json_array_length(log), 0)
        ELSE 0
    END,
    last_log_entry_json = CASE
        WHEN json_valid (log)
        AND json_type (log) = 'array'
        AND json_array_length(log) > 0 THEN json_extract(log, '$[' || (json_array_length(log) - 1) || ']')
        ELSE NULL
    END;
