-- A relation is stored once, from the point of view of its source: "source blocks
-- target", "source duplicates target" (target is the original), or "source relates
-- to target". The other item shows the inverse label. A pair of items can have one
-- relation in total, whichever way round, which the unique index enforces.
CREATE TABLE issue_relation (
    id TEXT NOT NULL PRIMARY KEY,
    sourceId TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    targetId TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('blocks', 'duplicates', 'relates')),
    createdAt INTEGER NOT NULL,
    createdBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    CHECK (sourceId <> targetId)
) STRICT;

CREATE UNIQUE INDEX issue_relation_pair ON issue_relation (min(sourceId, targetId), max(sourceId, targetId));
CREATE INDEX issue_relation_source ON issue_relation (sourceId);
CREATE INDEX issue_relation_target ON issue_relation (targetId);
