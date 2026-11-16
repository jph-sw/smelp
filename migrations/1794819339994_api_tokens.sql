-- Personal access tokens, for scripts and agents that call the API as a person.
-- Only a hash of the token is kept, so it can be shown just once when it's made.
-- A NULL lastUsedAt means never used, a NULL expiresAt means it never expires.
CREATE TABLE api_token (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    secretHash TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL,
    lastUsedAt INTEGER,
    expiresAt INTEGER
) STRICT;

CREATE INDEX api_token_userId ON api_token (userId);
