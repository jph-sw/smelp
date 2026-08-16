CREATE TABLE issue (
    id TEXT NOT NULL PRIMARY KEY,
    assignee TEXT,
    state TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    parentId TEXT,
    workspaceId TEXT NOT NULL,
    projectId TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);
