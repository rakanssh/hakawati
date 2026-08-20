ALTER TABLE scenarios ADD COLUMN content TEXT;

ALTER TABLE tales ADD COLUMN source_type TEXT CHECK (source_type IN ('local', 'catalog'));

ALTER TABLE tales ADD COLUMN source_scenario_id TEXT;

ALTER TABLE tales ADD COLUMN source_scenario_version_id TEXT;

ALTER TABLE tales ADD COLUMN source_scenario_title TEXT;

CREATE TABLE
    IF NOT EXISTS scenario_publish_links (
        local_scenario_id TEXT PRIMARY KEY,
        catalog_scenario_id TEXT NOT NULL,
        catalog_scenario_version_id TEXT,
        last_published_at INTEGER NOT NULL,
        FOREIGN KEY (local_scenario_id) REFERENCES scenarios (id) ON DELETE CASCADE
    );

UPDATE scenarios
SET
    content = COALESCE(
        (
            SELECT json_group_array(json(item_json))
            FROM (
                SELECT
                    0 AS section_order,
                    CAST(c.key AS INTEGER) AS item_order,
                    json_object(
                        'type',
                        'prompt_component',
                        'version',
                        1,
                        'id',
                        COALESCE(NULLIF(json_extract(c.value, '$.id'), ''), 'prompt-' || (CAST(c.key AS INTEGER) + 1)),
                        'promptType',
                        COALESCE(json_extract(c.value, '$.type'), 'plot'),
                        'content',
                        COALESCE(json_extract(c.value, '$.content'), '')
                    ) AS item_json
                FROM json_each(
                        CASE
                            WHEN json_valid(components)
                            AND json_type(components) = 'array' THEN components
                            ELSE '[]'
                        END
                    ) AS c
                UNION ALL
                SELECT
                    1 AS section_order,
                    CAST(s.key AS INTEGER) AS item_order,
                    json_object(
                        'type',
                        'story_card',
                        'version',
                        1,
                        'id',
                        COALESCE(NULLIF(json_extract(s.value, '$.id'), ''), 'story-card-' || (CAST(s.key AS INTEGER) + 1)),
                        'title',
                        COALESCE(json_extract(s.value, '$.title'), ''),
                        'triggers',
                        CASE
                            WHEN json_type(s.value, '$.triggers') = 'array' THEN json_extract(s.value, '$.triggers')
                            ELSE json_array()
                        END,
                        'content',
                        COALESCE(json_extract(s.value, '$.content'), ''),
                        'category',
                        COALESCE(json_extract(s.value, '$.category'), 'Uncategorized'),
                        'isPinned',
                        CASE
                            WHEN COALESCE(json_extract(s.value, '$.isPinned'), 0) THEN json('true')
                            ELSE json('false')
                        END
                    ) AS item_json
                FROM json_each(
                        CASE
                            WHEN json_valid(initial_story_cards)
                            AND json_type(initial_story_cards) = 'array' THEN initial_story_cards
                            ELSE '[]'
                        END
                    ) AS s
                UNION ALL
                SELECT
                    2 AS section_order,
                    CAST(st.key AS INTEGER) AS item_order,
                    json_object(
                        'type',
                        'stat',
                        'version',
                        1,
                        'id',
                        'stat-' || CASE
                            WHEN trim(COALESCE(json_extract(st.value, '$.name'), '')) <> '' THEN lower(replace(trim(json_extract(st.value, '$.name')), ' ', '-')) || '-' || (CAST(st.key AS INTEGER) + 1)
                            ELSE CAST(CAST(st.key AS INTEGER) + 1 AS TEXT)
                        END,
                        'name',
                        COALESCE(json_extract(st.value, '$.name'), ''),
                        'description',
                        COALESCE(json_extract(st.value, '$.description'), ''),
                        'value',
                        COALESCE(json_extract(st.value, '$.value'), 0),
                        'range',
                        json_array(
                            COALESCE(json_extract(st.value, '$.range[0]'), 0),
                            COALESCE(json_extract(st.value, '$.range[1]'), 100)
                        )
                    ) AS item_json
                FROM json_each(
                        CASE
                            WHEN json_valid(initial_stats)
                            AND json_type(initial_stats) = 'array' THEN initial_stats
                            ELSE '[]'
                        END
                    ) AS st
                UNION ALL
                SELECT
                    3 AS section_order,
                    CAST(i.key AS INTEGER) AS item_order,
                    json_object(
                        'type',
                        'inventory_item',
                        'version',
                        1,
                        'id',
                        'inventory_item-' || CASE
                            WHEN trim(CAST(i.value AS TEXT)) <> '' THEN lower(replace(trim(CAST(i.value AS TEXT)), ' ', '-')) || '-' || (CAST(i.key AS INTEGER) + 1)
                            ELSE CAST(CAST(i.key AS INTEGER) + 1 AS TEXT)
                        END,
                        'name',
                        CAST(i.value AS TEXT)
                    ) AS item_json
                FROM json_each(
                        CASE
                            WHEN json_valid(initial_inventory)
                            AND json_type(initial_inventory) = 'array' THEN initial_inventory
                            ELSE '[]'
                        END
                    ) AS i
                ORDER BY section_order, item_order
            )
        ),
        '[]'
    )
WHERE content IS NULL;

UPDATE tales
SET
    source_type = 'local',
    source_scenario_id = scenario_id
WHERE
    scenario_id IS NOT NULL
    AND source_type IS NULL;
