CREATE TABLE project (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    access TEXT NOT NULL CHECK (access IN ('public', 'private')),
    leadUserId TEXT,
    defaultAssigneeUserId TEXT,
    image TEXT,
    icon TEXT NOT NULL,
    workspaceId TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    spaceId TEXT NOT NULL REFERENCES auth_space(id) ON DELETE CASCADE,
    createdBy TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);
