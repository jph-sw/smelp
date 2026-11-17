-- Who hears about a work item. Comments and state changes notify an item's
-- watchers, and anyone in the workspace can watch or unwatch any item they can
-- read. Creating an item, being assigned it or commenting on it makes you a
-- watcher, so the seed below starts everyone off watching what they were already
-- told about. People no longer in the item's workspace are left out.
CREATE TABLE issue_watcher (
    issueId   TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    userId    TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    createdAt INTEGER NOT NULL,
    PRIMARY KEY (issueId, userId)
) STRICT;

CREATE INDEX issue_watcher_user ON issue_watcher (userId);

INSERT OR IGNORE INTO issue_watcher (issueId, userId, createdAt)
SELECT involved.issueId, involved.userId, CAST(unixepoch('subsec') * 1000 AS INTEGER)
FROM (
    SELECT id AS issueId, createdBy AS userId FROM issue WHERE createdBy IS NOT NULL
    UNION
    SELECT id, assignee FROM issue WHERE assignee IS NOT NULL
    UNION
    SELECT issueId, authorId FROM comment WHERE authorId IS NOT NULL
) AS involved
JOIN issue ON issue.id = involved.issueId
JOIN workspace ON workspace.id = issue.workspaceId
JOIN auth_space_member AS member
    ON member.spaceId = workspace.spaceId AND member.userId = involved.userId;
