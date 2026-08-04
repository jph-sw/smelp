import { DB } from "@smelp/db"
import type { SQL } from "bun";

export class Migrator {
  private sql: SQL;

  constructor() {
    this.sql = new DB().sqlite
  }

  async up() {
    await this.sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      version       TEXT NOT NULL UNIQUE,   -- "20260804120000" or "001"
      name          TEXT NOT NULL,          -- "create_users"
      checksum      TEXT NOT NULL,          -- sha256 of file content
      applied_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      execution_ms  INTEGER
    );`

    console.log("up")
  }

  pending() {}

  executed() { }
}
