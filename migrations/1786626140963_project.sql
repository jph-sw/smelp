CREATE TABLE project (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    access TEXT NOT NULL CHECK (access IN ('public', 'private')),
    leadUserId TEXT,
    defaultAssigneeUserId TEXT,
    image TEXT,
    icon TEXT NOT NULL,
    workspaceId TEXT NOT NULL,
    createdBy TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);

CREATE TABLE project_member (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    userId TEXT NOT NULL
);
