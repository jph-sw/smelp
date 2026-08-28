CREATE TABLE auth_space_invite (
    id TEXT NOT NULL PRIMARY KEY,
    spaceId TEXT NOT NULL REFERENCES auth_space(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('guest', 'member', 'admin')),
    invitedByUserId TEXT NOT NULL REFERENCES auth_user(id),
    createdAt INTEGER NOT NULL,
    acceptedAt INTEGER
) STRICT;

CREATE UNIQUE INDEX auth_space_invite_space_email ON auth_space_invite (spaceId, email)
    WHERE acceptedAt IS NULL;
