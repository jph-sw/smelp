import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { DB, databasePath, type tables, Utils } from "@smelp/db";
import type { BunFile, SQL } from "bun";

export class Migrator {
	private sql: SQL;
	private migrations_folder: string;
	private utils: Utils;

	constructor(migrationsFolder = "./migrations/") {
		this.sql = new DB().sqlite;
		this.migrations_folder = migrationsFolder;
		this.utils = new Utils();
	}

	// Runs through bun:sqlite because SQL.file() can stop after a file's first
	// statement and still report success. A failure rolls the whole file back and
	// stops the boot, so a half-applied migration is never recorded as done.
	private async apply(
		file: BunFile,
		schemaMigration: tables["schema_migrations"],
	) {
		const contents = await file.text();
		const db = new Database(databasePath());

		try {
			db.run("BEGIN");
			db.run(contents);
			db.query(
				"INSERT INTO schema_migrations (id, name, checksum, applied_at, execution_ms) VALUES (?, ?, ?, ?, ?)",
			).run(
				schemaMigration.id,
				schemaMigration.name,
				schemaMigration.checksum,
				schemaMigration.applied_at,
				schemaMigration.execution_ms,
			);
			db.run("COMMIT");
		} catch (error) {
			if (db.inTransaction) db.run("ROLLBACK");
			this.utils.logger.fatal(`Migration ${schemaMigration.name} failed`);
			throw error;
		} finally {
			db.close();
		}
	}

	async up() {
		await this.sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,          -- "create_users"
      checksum      TEXT NOT NULL,          -- sha256 of file content
      applied_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      execution_ms  INTEGER
    );`;

		// TODO: handle no folder found
		let files = await readdir(this.migrations_folder);

		files = files
			.filter((f) => /^\d+_/.test(f))
			.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

		this.utils.logger.debug(`found ${files.length} migration/s`);

		if (files.length <= 0) throw Error("No migrations present");

		for (let i = 0; i < files.length; i++) {
			const fileName = files[i] ?? "";
			const file = Bun.file(path.join(this.migrations_folder, fileName));

			const rows = await this.executed();

			const checksum = await this.utils.checksumFile(file);

			if (rows.some((item) => item.checksum === checksum)) {
				this.utils.logger.debug(`${file.name} has already been exectuted`);
				continue;
			}

			this.utils.logger.debug(`executing ${fileName}`);

			const schemaMigration: tables["schema_migrations"] = {
				id: crypto.randomUUID(),
				name: fileName,
				checksum: checksum,
				applied_at: Date.now(),
				execution_ms: 0,
			};

			await this.apply(file, schemaMigration);
		}
	}

	pending() {}

	async executed() {
		const rows = (await this
			.sql`SELECT * FROM schema_migrations`) as tables["schema_migrations"][];

		return rows;
	}
}
