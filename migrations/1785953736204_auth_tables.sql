CREATE TABLE auth_user (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
) STRICT;

CREATE TABLE auth_session (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES user(id),
    secretHash BLOB NOT NULL,
    tokenLastVerifiedAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
) STRICT;

CREATE TABLE auth_account (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt INTEGER,
    refreshTokenExpiresAt INTEGER,
    scope TEXT,
    idToken TEXT,
    password TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
)
