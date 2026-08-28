CREATE TABLE project_counter (
  projectId   TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  lastNumber   INTEGER NOT NULL DEFAULT 0
);
