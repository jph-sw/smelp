ALTER TABLE project ADD COLUMN spaceId TEXT NOT NULL REFERENCES auth_space(id);

DROP TABLE project_member;
