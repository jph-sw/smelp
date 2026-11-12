-- Web links attached to a work item. Title is optional; the URL stands in for it.
CREATE TABLE issue_link (
    id TEXT NOT NULL PRIMARY KEY,
    issueId TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    createdBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    createdAt INTEGER NOT NULL
) STRICT;

CREATE INDEX issue_link_issueId ON issue_link (issueId);
