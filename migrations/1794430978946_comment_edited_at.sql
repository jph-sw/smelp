-- Set each time the author edits a comment; NULL means it was never edited.
ALTER TABLE comment ADD COLUMN editedAt INTEGER;
