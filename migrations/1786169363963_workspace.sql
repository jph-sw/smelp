CREATE TABLE workspace (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    spaceId TEXT NOT NULL REFERENCES auth_space(id) ON DELETE CASCADE,
    image TEXT
);
