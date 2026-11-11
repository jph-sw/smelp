-- An archived project is read-only. Both columns stay NULL until it is archived,
-- and go back to NULL when it is unarchived.
ALTER TABLE project ADD COLUMN archivedAt INTEGER;
ALTER TABLE project ADD COLUMN archivedBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL;
