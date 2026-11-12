-- Time-boxed iterations of a project. Dates are whole days stored as YYYY-MM-DD, so
-- they compare correctly as text. The API keeps a project's cycles from overlapping.
CREATE TABLE cycle (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    startDate TEXT NOT NULL CHECK (startDate GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    endDate TEXT NOT NULL CHECK (endDate GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    createdBy TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
    createdAt INTEGER NOT NULL,
    CHECK (endDate >= startDate)
) STRICT;

CREATE INDEX cycle_projectId ON cycle (projectId, startDate);

-- A work item is in at most one cycle. Deleting a cycle empties it rather than
-- deleting its items.
ALTER TABLE issue ADD COLUMN cycleId TEXT REFERENCES cycle(id) ON DELETE SET NULL;
CREATE INDEX issue_cycleId ON issue (cycleId);
