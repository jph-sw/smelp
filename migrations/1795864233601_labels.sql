-- Labels tag work items across type, module and cycle, like "frontend" or
-- "customer-reported". Each project has its own, and a name is used once per
-- project, whatever its case. An item can carry any number of its project's
-- labels. Deleting a label takes it off every item that had it.
CREATE TABLE label (
    id        TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    color     TEXT NOT NULL,
    createdAt INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX label_project_name ON label (projectId, name COLLATE NOCASE);

CREATE TABLE issue_label (
    issueId TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    labelId TEXT NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (issueId, labelId)
) STRICT;

CREATE INDEX issue_label_label ON issue_label (labelId);
