-- Per-user inbox. One row per person per work item: a new event on an item the
-- person already has a row for updates that row (newest actor, time and comment,
-- unread again) instead of adding another. The strongest reason among unread ones
-- is kept: mention, then assigned, then comment. The issue title is copied so a row
-- still reads well after a rename. Rows follow their work item and their user when
-- either is deleted; deleting the comment only clears the link to it.
CREATE TABLE notification (
    id           TEXT NOT NULL PRIMARY KEY,
    userId       TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    workspaceId  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    actorId      TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    issueId      TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    projectId    TEXT NOT NULL,
    commentId    TEXT REFERENCES comment(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    createdAt    INTEGER NOT NULL,
    readAt       INTEGER
) STRICT;

CREATE UNIQUE INDEX notification_item ON notification (userId, issueId);
CREATE INDEX notification_inbox ON notification (userId, workspaceId, createdAt DESC);
CREATE INDEX notification_unread ON notification (userId, workspaceId) WHERE readAt IS NULL;

-- Email for notifications is opt-in: 0 until the person turns it on.
ALTER TABLE auth_user ADD COLUMN notifyByEmail INTEGER NOT NULL DEFAULT 0;
