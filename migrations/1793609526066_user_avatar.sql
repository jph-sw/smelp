-- Kept out of auth_user so that reading a user never loads image bytes, and in the
-- database so that a backup of the one file includes every avatar.
CREATE TABLE auth_user_avatar (
    userId TEXT NOT NULL PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
    contentType TEXT NOT NULL,
    data BLOB NOT NULL,
    updatedAt INTEGER NOT NULL
) STRICT;
