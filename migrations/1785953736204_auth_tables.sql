CREATE TABLE user (
    id TEXT NOT NULL PRIMARY KEY
) STRICT;

CREATE TABLE auth_session (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES user(id),
    secretHash BLOB NOT NULL, -- blob is a SQLite data type for raw binary
    tokenLastVerifiedAt INTEGER NOT NULL, -- unix time (seconds)
    createdAt INTEGER NOT NULL -- unix time (seconds)
) STRICT;
