CREATE TABLE state (
    id TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    "group" TEXT NOT NULL,
    projectId TEXT NOT NULL,
    isDefault BOOLEAN DEFAULT FALSE
);
