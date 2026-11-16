import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Imported dynamically so setup.ts points the database at a temp file first.
await import("./setup");
const { DB } = await import("@smelp/db");
const { Migrator } = await import("@smelp/migrate");

const sql = new DB().sqlite;

const folders: string[] = [];
function folderWith(fileName: string, contents: string) {
	const folder = mkdtempSync(path.join(tmpdir(), "smelp-migrations-"));
	writeFileSync(path.join(folder, fileName), contents);
	folders.push(folder);
	return folder;
}

const tableExists = async (name: string) =>
	(
		await sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${name}`
	).length > 0;

const isRecorded = async (name: string) =>
	(await sql`SELECT name FROM schema_migrations WHERE name = ${name}`).length >
	0;

afterEach(() => {
	for (const folder of folders.splice(0)) {
		rmSync(folder, { recursive: true });
	}
});

describe("Migrator", () => {
	test("runs every statement in a file, not just the first", async () => {
		const name = "1_multi.sql";
		const folder = folderWith(
			name,
			`CREATE TABLE multi_a (id TEXT);
			ALTER TABLE multi_a ADD COLUMN one TEXT;
			ALTER TABLE multi_a ADD COLUMN two TEXT;
			-- a comment between statements
			CREATE TABLE multi_b (id TEXT);`,
		);

		await new Migrator(folder).up();

		const columns = (await sql`PRAGMA table_info(multi_a)`) as {
			name: string;
		}[];
		expect(columns.map((column) => column.name)).toEqual(["id", "one", "two"]);
		expect(await tableExists("multi_b")).toBe(true);
		expect(await isRecorded(name)).toBe(true);
	});

	test("a failed migration stops, rolls back and isn't recorded", async () => {
		const name = "2_broken.sql";
		const folder = folderWith(
			name,
			`CREATE TABLE half_done (id TEXT);
			ALTER TABLE table_that_does_not_exist ADD COLUMN nope TEXT;`,
		);

		await expect(new Migrator(folder).up()).rejects.toThrow();

		expect(await tableExists("half_done")).toBe(false);
		expect(await isRecorded(name)).toBe(false);
	});

	test("doesn't run a migration twice", async () => {
		const name = "3_once.sql";
		const folder = folderWith(name, "CREATE TABLE only_once (id TEXT);");

		await new Migrator(folder).up();
		await new Migrator(folder).up();

		expect(await tableExists("only_once")).toBe(true);
	});

	test("the signup mode migration keeps whether sign-up was open", async () => {
		const migration = (
			await Array.fromAsync(
				new Bun.Glob("*_signup_mode.sql").scan("migrations"),
			)
		)[0];
		if (!migration) throw new Error("signup mode migration not found");
		const contents = await Bun.file(`migrations/${migration}`).text();
		const [{ value: current }] = (await sql`
			SELECT value FROM instance_setting WHERE key = 'signup'
		`) as [{ value: string }];

		for (const [old, mode] of [
			["true", "open"],
			["false", "closed"],
		] as const) {
			await sql`DELETE FROM instance_setting WHERE key = 'signup'`;
			await sql`INSERT INTO instance_setting (key, value) VALUES ('signupOpen', ${old})`;

			// The migrator skips content it has run before, by checksum.
			const copy = `${contents}\n-- test copy ${old}`;
			await new Migrator(folderWith(`4_signup_${old}.sql`, copy)).up();

			const settings = (await sql`
				SELECT key, value FROM instance_setting WHERE key LIKE 'signup%'
			`) as { key: string; value: string }[];
			expect(settings).toEqual([{ key: "signup", value: mode }]);
		}

		await sql`UPDATE instance_setting SET value = ${current} WHERE key = 'signup'`;
	});
});
