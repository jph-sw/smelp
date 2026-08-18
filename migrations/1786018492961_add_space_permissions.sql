CREATE TABLE auth_space (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL REFERENCES auth_user(id),
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
) STRICT;

CREATE TABLE auth_space_member (
    id TEXT NOT NULL PRIMARY KEY,
    spaceId TEXT NOT NULL REFERENCES auth_space(id),
    userId TEXT NOT NULL REFERENCES auth_user(id),
    role TEXT NOT NULL CHECK (role IN ('guest', 'member', 'admin')),
    createdAt INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX auth_space_member_space_user ON auth_space_member (spaceId, userId);
