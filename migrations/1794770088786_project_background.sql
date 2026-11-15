-- Kept out of project so that reading a project never loads image bytes, and in
-- the database so that a backup of the one file includes every board background.
CREATE TABLE project_background (
    projectId TEXT NOT NULL PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
    contentType TEXT NOT NULL,
    data BLOB NOT NULL,
    updatedAt INTEGER NOT NULL
) STRICT;

-- The background's address, which changes with each upload; NULL means none.
ALTER TABLE project ADD COLUMN backgroundImage TEXT;
