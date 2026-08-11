CREATE TABLE workspace (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    image TEXT
);

CREATE TABLE workspace_member (
    id TEXT NOT NULL PRIMARY KEY,
    workspaceId TEXT NOT NULL,
    userId TEXT NOT NULL
);
