CREATE TABLE issue (
    id TEXT NOT NULL PRIMARY KEY,
    assignee TEXT,
    state TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    parentId TEXT,
    workspaceId TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
);
