-- Per-user inbox. One row per person per thing that needs them. The issue title is
-- copied so a row still reads well after a rename. Rows follow their work item and
-- their user when either is deleted.
CREATE TABLE notification (
    id           TEXT NOT NULL PRIMARY KEY,
    userId       TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    workspaceId  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    actorId      TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    issueId      TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    projectId    TEXT NOT NULL,
    commentId    TEXT,
    title        TEXT NOT NULL,
    createdAt    INTEGER NOT NULL,
    readAt       INTEGER
) STRICT;

CREATE INDEX notification_inbox ON notification (userId, workspaceId, createdAt DESC);
CREATE INDEX notification_unread ON notification (userId, workspaceId) WHERE readAt IS NULL;

-- Email for notifications is opt-in: 0 until the person turns it on.
ALTER TABLE auth_user ADD COLUMN notifyByEmail INTEGER NOT NULL DEFAULT 0;
