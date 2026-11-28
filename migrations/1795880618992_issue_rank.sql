-- The hand-set order of a project's backlog, one order across all states. A rank is
-- a fractional-indexing key (base 62, compared byte by byte), so an item moves
-- between two others by writing only its own rank. Ties sort by id.
ALTER TABLE issue ADD COLUMN rank TEXT NOT NULL DEFAULT '';

-- Existing items keep the order the board showed them in, most recently changed
-- first. "c" heads a key with a three-digit integer part, so every project gets
-- c000, c001, ... up to 238328 items.
UPDATE issue SET rank = ranked.rank
FROM (
    SELECT
        id,
        'c'
            || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', n / 3844 % 62 + 1, 1)
            || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', n / 62 % 62 + 1, 1)
            || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', n % 62 + 1, 1)
            AS rank
    FROM (
        SELECT id, row_number() OVER (PARTITION BY projectId ORDER BY updatedAt DESC, id) - 1 AS n
        FROM issue
    )
) AS ranked
WHERE ranked.id = issue.id;

CREATE INDEX issue_project_rank ON issue (projectId, rank);
