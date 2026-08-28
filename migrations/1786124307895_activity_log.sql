CREATE TABLE activity_logs (
    id           TEXT NOT NULL PRIMARY KEY,
    workspaceId  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    entityType   TEXT NOT NULL,
    entityId     TEXT NOT NULL,
    action       TEXT NOT NULL,
    actorId      TEXT,
    field        TEXT,
    oldValue     TEXT,
    newValue     TEXT,
    metadata     TEXT,
    createdAt    INTEGER NOT NULL
) STRICT;

CREATE INDEX activity_logs_workspaceId ON activity_logs (workspaceId);
