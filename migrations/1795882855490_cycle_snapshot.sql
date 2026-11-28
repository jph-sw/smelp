-- A completed cycle's commitment and result, frozen once it is over. Live counts
-- change when unfinished items move on or estimates are edited later, which would
-- rewrite past sprints and the velocity planned from them.
CREATE TABLE cycle_snapshot (
    cycleId TEXT PRIMARY KEY REFERENCES cycle(id) ON DELETE CASCADE,
    committedItems INTEGER NOT NULL,
    committedPoints REAL NOT NULL,
    completedItems INTEGER NOT NULL,
    completedPoints REAL NOT NULL,
    frozenAt INTEGER NOT NULL
) STRICT;
