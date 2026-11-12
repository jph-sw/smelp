-- Remembers which project came from which outside project, so importing the same
-- export twice is caught instead of silently making a second copy. The unique index
-- also stops two imports of the same key racing past each other. It goes away with
-- the project (or the workspace).
CREATE TABLE import_record (
    id TEXT NOT NULL PRIMARY KEY,
    workspaceId TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    sourceKey TEXT NOT NULL,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    importedBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    importedAt INTEGER NOT NULL,
    itemCount INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX import_record_source ON import_record (workspaceId, source, sourceKey);
CREATE INDEX import_record_projectId ON import_record (projectId);
