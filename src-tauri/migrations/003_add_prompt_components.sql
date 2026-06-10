ALTER TABLE scenarios ADD COLUMN components TEXT NOT NULL DEFAULT '[]';

ALTER TABLE tales ADD COLUMN components TEXT NOT NULL DEFAULT '[]';

UPDATE scenarios
SET components = json_array(
    json_object(
        'id',
        lower(hex(randomblob(6))),
        'type',
        'plot',
        'content',
        initial_description,
        'createdAt',
        created_at,
        'updatedAt',
        updated_at
    ),
    json_object(
        'id',
        lower(hex(randomblob(6))),
        'type',
        'author_note',
        'content',
        initial_author_note,
        'createdAt',
        created_at,
        'updatedAt',
        updated_at
    ),
    json_object(
        'id',
        lower(hex(randomblob(6))),
        'type',
        'opening',
        'content',
        opening_text,
        'createdAt',
        created_at,
        'updatedAt',
        updated_at
    )
)
WHERE components = '[]';

UPDATE tales
SET components = json_array(
    json_object(
        'id',
        lower(hex(randomblob(6))),
        'type',
        'plot',
        'content',
        description,
        'createdAt',
        created_at,
        'updatedAt',
        updated_at
    ),
    json_object(
        'id',
        lower(hex(randomblob(6))),
        'type',
        'author_note',
        'content',
        author_note,
        'createdAt',
        created_at,
        'updatedAt',
        updated_at
    )
)
WHERE components = '[]';
