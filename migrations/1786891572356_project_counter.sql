CREATE TABLE project_counter (
  projectId   TEXT PRIMARY KEY,
  lastNumber   INTEGER NOT NULL DEFAULT 0
);
