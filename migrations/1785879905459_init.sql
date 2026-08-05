CREATE TABLE IF NOT EXISTS schema_migrations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,          -- "create_users"
  checksum      TEXT NOT NULL,          -- sha256 of file content
  applied_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  execution_ms  INTEGERaa
);
