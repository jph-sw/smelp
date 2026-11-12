-- A module groups the work items of a feature or epic. A work item belongs to at
-- most one. Deleting a module only clears the reference on its items. The lead is
-- checked against project membership when it is set; the target date is a plain
-- YYYY-MM-DD day.
CREATE TABLE module (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    leadId TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    targetDate TEXT,
    createdAt INTEGER NOT NULL,
    createdBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX module_project_name ON module (projectId, lower(name));

ALTER TABLE issue ADD COLUMN moduleId TEXT REFERENCES module(id) ON DELETE SET NULL;
CREATE INDEX issue_moduleId ON issue (moduleId);
