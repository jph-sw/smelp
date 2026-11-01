CREATE TABLE auth_password_reset (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    tokenHash TEXT NOT NULL UNIQUE,
    createdByUserId TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    usedAt INTEGER
) STRICT;

CREATE INDEX auth_password_reset_userId ON auth_password_reset (userId);
