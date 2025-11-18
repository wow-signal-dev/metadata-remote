-- Tag types (ARTIST, ALBUM, GENRE, etc.)
CREATE TABLE IF NOT EXISTS tags (
    tag_id INTEGER PRIMARY KEY,
    tag_name TEXT UNIQUE NOT NULL
);

-- Music files
CREATE TABLE IF NOT EXISTS files (
    file_id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT,
    folder TEXT,
    size INTEGER,
    date INTEGER
);

-- File-to-tag mappings with values
CREATE TABLE IF NOT EXISTS file_tags (
    file_id INTEGER,
    tag_id INTEGER,
    tag_value TEXT,
    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id),
    PRIMARY KEY (file_id, tag_id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_file_tags_lookup ON file_tags(tag_id, tag_value);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
