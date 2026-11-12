-- One row per person per emoji per comment; the primary key enforces that.
-- Rows go away with their comment, and with the user who left them.
CREATE TABLE comment_reaction (
    commentId TEXT NOT NULL REFERENCES comment(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    PRIMARY KEY (commentId, userId, emoji)
) STRICT;
