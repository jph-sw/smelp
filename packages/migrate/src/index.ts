import { DB, Utils, type tables } from "@smelp/db"
import { SQL } from "bun";
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";

export class Migrator {
  private sql: SQL;
  private migrations_folder: string;
  private utils: Utils

  constructor() {
    this.sql = new DB().sqlite
    this.migrations_folder = "./migrations/"
    this.utils = new Utils()
  }

  async up() {
    await this.sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,          -- "create_users"
      checksum      TEXT NOT NULL,          -- sha256 of file content
      applied_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      execution_ms  INTEGER
    );`

    // TODO: handle no folder found
    const files = await readdir(this.migrations_folder);

    this.utils.logger.info(`found ${files.length} migration/s`)

    if (files.length <= 0) throw Error("No migrations present")

    for (var i = 0; i < files.length; i++) {
      const file = Bun.file(path.join(this.migrations_folder, files[i]!))

      const rows = await this.executed()

      const checksum = await this.utils.checksumFile(file)

      if (rows.some(item => item.checksum == checksum)) {
        this.utils.logger.info(`${file.name} has already been exectuted`)
        continue
      }

      this.utils.logger.info(`executing ${files[i]!}`)

      const schemaMigration: tables["schema_migrations"] = {
        id: crypto.randomUUID(),
        name: files[i]!,
        checksum: checksum,
        applied_at: Date.now(),
        execution_ms: 0
      }

      try {
        await this.sql.file(path.join(this.migrations_folder, files[i]!))
      } catch (error) {
        if (error instanceof SQL.SQLiteError) {
          this.utils.logger.fatal(error)
        }
      }

      try {
        await this.sql`
          INSERT INTO schema_migrations ${this.sql(schemaMigration)}
          RETURNING *
          `.values()
      } catch (error) {
        if (error instanceof SQL.SQLiteError) {
          this.utils.logger.fatal(error)
        }
      }
    }
  }

  pending() { }

  async executed() {
    const rows = await this.sql`SELECT * FROM schema_migrations` as tables["schema_migrations"][]

    return rows
  }
}
