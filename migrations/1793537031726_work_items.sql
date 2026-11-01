ALTER TABLE issue ADD COLUMN createdBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL;
ALTER TABLE issue ADD COLUMN updatedBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL;

-- Existing work items get their authors from the activity log where it has them.
UPDATE issue SET createdBy = (
    SELECT actorId FROM activity_logs
    WHERE entityType = 'issue' AND entityId = issue.id AND action = 'created'
    ORDER BY createdAt ASC LIMIT 1
);
UPDATE issue SET updatedBy = (
    SELECT actorId FROM activity_logs
    WHERE entityType = 'issue' AND entityId = issue.id
    ORDER BY createdAt DESC LIMIT 1
);

ALTER TABLE state ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE state SET position = CASE "group"
    WHEN 'backlog' THEN 0
    WHEN 'unstarted' THEN 1
    WHEN 'started' THEN 2
    WHEN 'completed' THEN 3
    ELSE 4
END;

CREATE TABLE comment (
    id TEXT NOT NULL PRIMARY KEY,
    issueId TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    authorId TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    createdAt INTEGER NOT NULL
) STRICT;

CREATE INDEX comment_issueId ON comment (issueId);
CREATE INDEX issue_assignee ON issue (assignee);
CREATE INDEX activity_logs_entity ON activity_logs (entityType, entityId);
