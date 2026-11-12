-- Only the metadata lives here. The file itself is on disk under storageKey, in the
-- attachments folder next to the database. commentId is NULL for files attached to
-- the work item itself.
CREATE TABLE attachment (
    id TEXT NOT NULL PRIMARY KEY,
    issueId TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    commentId TEXT REFERENCES comment(id) ON DELETE CASCADE,
    uploaderId TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    contentType TEXT NOT NULL,
    storageKey TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL
) STRICT;

CREATE INDEX attachment_issueId ON attachment (issueId);
CREATE INDEX attachment_commentId ON attachment (commentId);
