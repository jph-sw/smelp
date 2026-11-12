import { Database } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	BackupError,
	checkBackup,
	createBackup,
	isServerRunning,
	markServerRunning,
	restoreBackup,
} from "../src/lib/backup";

const root = mkdtempSync(path.join(tmpdir(), "smelp-backup-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let directory: string;
let databasePath: string;
let migrations: string;
let counter = 0;

function write(file: string, value: string, migration = "1_first.sql") {
	const db = new Database(file);
	db.run("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT)");
	db.run("CREATE TABLE IF NOT EXISTS note (value TEXT)");
	db.run("DELETE FROM schema_migrations");
	db.run("INSERT INTO schema_migrations VALUES (?)", [migration]);
	db.run("INSERT INTO note VALUES (?)", [value]);
	db.close();
}
function notes(file: string) {
	const db = new Database(file, { readonly: true });
	const rows = db.query("SELECT value FROM note").all() as { value: string }[];
	db.close();
	return rows.map((row) => row.value);
}

beforeEach(() => {
	counter += 1;
	directory = path.join(root, String(counter));
	migrations = path.join(directory, "migrations");
	mkdirSync(migrations, { recursive: true });
	writeFileSync(path.join(migrations, "1_first.sql"), "");
	databasePath = path.join(directory, "smelp.sqlite");
	write(databasePath, "original");
});

describe("creating a backup", () => {
	test("makes a complete copy next to the database", () => {
		const { file, bytes } = createBackup(databasePath);
		expect(path.dirname(file)).toBe(path.join(directory, "backups"));
		expect(path.basename(file)).toMatch(/^smelp-.*\.sqlite$/);
		expect(bytes).toBeGreaterThan(0);
		expect(notes(file)).toEqual(["original"]);
		expect(existsSync(`${file}.partial`)).toBe(false);
	});

	test("only its owner can read it, since it holds password hashes", () => {
		const { file } = createBackup(databasePath);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
	});

	test("captures a consistent copy while another connection is writing", () => {
		const writer = new Database(databasePath);
		writer.run("BEGIN");
		writer.run("INSERT INTO note VALUES ('not committed')");
		const { file } = createBackup(databasePath);
		writer.run("COMMIT");
		writer.close();
		expect(notes(file)).toEqual(["original"]);
		expect(notes(databasePath)).toContain("not committed");
	});

	test("doesn't change the database", () => {
		const before = readFileSync(databasePath);
		createBackup(databasePath);
		expect(readFileSync(databasePath).equals(before)).toBe(true);
	});

	test("writes to a chosen file, and never over an existing one", () => {
		const chosen = path.join(directory, "elsewhere", "mine.sqlite");
		expect(createBackup(databasePath, chosen).file).toBe(chosen);
		expect(() => createBackup(databasePath, chosen)).toThrow(BackupError);
	});

	test("explains a missing database", () => {
		expect(() => createBackup(path.join(directory, "none.sqlite"))).toThrow(
			"No database found",
		);
	});
});

describe("restoring a backup", () => {
	const restore = (file: string) =>
		restoreBackup(databasePath, file, migrations);

	test("brings the old data back and keeps the current database", () => {
		const { file } = createBackup(databasePath);
		write(databasePath, "written later");

		const { setAside } = restore(file);

		expect(notes(databasePath)).toEqual(["original"]);
		expect(setAside).toBeTruthy();
		expect(notes(setAside as string)).toEqual(["original", "written later"]);
		expect(existsSync(`${databasePath}.restoring`)).toBe(false);
	});

	test("the restored database is restricted and usable", () => {
		const { file } = createBackup(databasePath);
		restore(file);
		expect(statSync(databasePath).mode & 0o777).toBe(0o600);
		write(databasePath, "after restore");
		expect(notes(databasePath)).toContain("after restore");
		// The backup itself is untouched, so it can be restored again.
		expect(notes(file)).toEqual(["original"]);
	});

	test("works when the current database is gone", () => {
		const { file } = createBackup(databasePath);
		rmSync(databasePath);
		expect(restore(file).setAside).toBeNull();
		expect(notes(databasePath)).toEqual(["original"]);
	});

	test("replaces a damaged database, setting it aside", () => {
		const { file } = createBackup(databasePath);
		writeFileSync(databasePath, "this is not a database");
		const { setAside } = restore(file);
		expect(notes(databasePath)).toEqual(["original"]);
		expect(readFileSync(setAside as string, "utf8")).toBe(
			"this is not a database",
		);
	});

	test("moves a leftover journal away, so it can't be applied to the backup", () => {
		const { file } = createBackup(databasePath);
		writeFileSync(`${databasePath}-journal`, "old journal");
		const { setAside } = restore(file);
		expect(existsSync(`${databasePath}-journal`)).toBe(false);
		expect(existsSync(`${setAside}-journal`)).toBe(true);
		expect(notes(databasePath)).toEqual(["original"]);
	});

	const expectRefused = (file: string, message: string) => {
		const before = readFileSync(databasePath);
		expect(() => restore(file)).toThrow(message);
		expect(readFileSync(databasePath).equals(before)).toBe(true);
		expect(existsSync(`${databasePath}.restoring`)).toBe(false);
	};

	test("refuses a file that doesn't exist", () => {
		expectRefused(path.join(directory, "nope.sqlite"), "doesn't exist");
	});

	test("refuses something that isn't a database", () => {
		const file = path.join(directory, "notes.sqlite");
		writeFileSync(file, "just some text, long enough to not be empty");
		expectRefused(file, "isn't a healthy SQLite database");
	});

	test("refuses a damaged backup", () => {
		const { file } = createBackup(databasePath);
		const bytes = readFileSync(file);
		bytes.fill(0xab, 4096, bytes.length);
		writeFileSync(file, bytes);
		expectRefused(file, "isn't a healthy SQLite database");
	});

	test("refuses a database that isn't from smelp", () => {
		const file = path.join(directory, "other.sqlite");
		const db = new Database(file);
		db.run("CREATE TABLE something (id TEXT)");
		db.close();
		expectRefused(file, "isn't a smelp backup");
	});

	test("refuses a backup from a newer version", () => {
		const file = path.join(directory, "newer.sqlite");
		write(file, "from the future", "2_newer.sql");
		expectRefused(file, "came from a newer version");
	});

	test("accepts a backup from an older version", () => {
		const { file } = createBackup(databasePath);
		writeFileSync(path.join(migrations, "2_newer.sql"), "");
		expect(() => checkBackup(file, migrations)).not.toThrow();
		restore(file);
		expect(notes(databasePath)).toEqual(["original"]);
	});

	test("refuses the current database as its own backup", () => {
		expectRefused(databasePath, "is the current database");
	});

	test("refuses while the server is running", () => {
		const { file } = createBackup(databasePath);
		const stop = markServerRunning(databasePath);
		expectRefused(file, "still running");
		stop();
		expect(() => restore(file)).not.toThrow();
	});

	test("isn't blocked forever by a server that crashed", () => {
		const { file } = createBackup(databasePath);
		const marker = `${databasePath}.running`;
		writeFileSync(marker, "");
		const longAgo = new Date(Date.now() - 60_000);
		utimesSync(marker, longAgo, longAgo);
		expect(isServerRunning(databasePath)).toBe(false);
		expect(() => restore(file)).not.toThrow();
	});
});

describe("noticing a running server", () => {
	test("starts false, then true, then false after stopping", () => {
		expect(isServerRunning(databasePath)).toBe(false);
		const stop = markServerRunning(databasePath);
		expect(isServerRunning(databasePath)).toBe(true);
		stop();
		expect(isServerRunning(databasePath)).toBe(false);
	});

	test("expires if it isn't refreshed", () => {
		const stop = markServerRunning(databasePath);
		expect(isServerRunning(databasePath, Date.now() + 31_000)).toBe(false);
		stop();
	});
});

describe("attachments", () => {
	let files: string;
	const restoreWithFiles = (file: string) =>
		restoreBackup(databasePath, file, migrations, files);

	function attach(key: string, content: string, row = true) {
		mkdirSync(files, { recursive: true });
		writeFileSync(path.join(files, key), content);
		if (!row) return;
		const db = new Database(databasePath);
		db.run("CREATE TABLE IF NOT EXISTS attachment (storageKey TEXT)");
		db.run("INSERT INTO attachment VALUES (?)", [key]);
		db.close();
	}

	beforeEach(() => {
		files = path.join(directory, "attachments");
	});

	test("a backup includes the files its database refers to", () => {
		attach("one", "first file");
		attach("two", "second file");
		attach("unreferenced", "added after the snapshot", false);

		const { file, attachments } = createBackup(databasePath, undefined, files);

		expect(attachments).toBe(2);
		const copy = `${file}.attachments`;
		expect(readFileSync(path.join(copy, "one"), "utf8")).toBe("first file");
		expect(readFileSync(path.join(copy, "two"), "utf8")).toBe("second file");
		expect(existsSync(path.join(copy, "unreferenced"))).toBe(false);
		expect(statSync(path.join(copy, "one")).mode & 0o777).toBe(0o600);
		expect(existsSync(`${copy}.partial`)).toBe(false);
	});

	test("skips a file that was deleted after the database was copied", () => {
		attach("gone", "x");
		rmSync(path.join(files, "gone"));
		expect(createBackup(databasePath, undefined, files).attachments).toBe(0);
	});

	test("a database without attachments makes the same single-file backup", () => {
		const { file, attachments } = createBackup(databasePath, undefined, files);
		expect(attachments).toBe(0);
		expect(existsSync(`${file}.attachments`)).toBe(false);
	});

	test("restoring brings the files back and keeps the current ones", () => {
		attach("one", "original");
		const { file } = createBackup(databasePath, undefined, files);
		writeFileSync(path.join(files, "one"), "changed");
		attach("later", "attached later");

		const { attachmentsSetAside } = restoreWithFiles(file);

		expect(readFileSync(path.join(files, "one"), "utf8")).toBe("original");
		expect(existsSync(path.join(files, "later"))).toBe(false);
		expect(
			readFileSync(path.join(attachmentsSetAside as string, "later"), "utf8"),
		).toBe("attached later");
		expect(existsSync(`${files}.restoring`)).toBe(false);
	});

	test("restoring an old backup without files leaves the current ones", () => {
		const { file } = createBackup(databasePath);
		attach("keep", "still here", false);
		const result = restoreWithFiles(file);
		expect(result.attachmentsSetAside).toBeNull();
		expect(result.attachmentsMissing).toBe(false);
		expect(readFileSync(path.join(files, "keep"), "utf8")).toBe("still here");
	});

	test("warns when the backup refers to files that weren't kept with it", () => {
		attach("one", "original");
		const { file } = createBackup(databasePath, undefined, files);
		rmSync(`${file}.attachments`, { recursive: true });
		expect(restoreWithFiles(file).attachmentsMissing).toBe(true);
	});

	test("a refused restore doesn't touch the files", () => {
		attach("one", "original");
		const { file } = createBackup(databasePath, undefined, files);
		const stop = markServerRunning(databasePath);
		expect(() => restoreWithFiles(file)).toThrow("still running");
		stop();
		expect(readFileSync(path.join(files, "one"), "utf8")).toBe("original");
		expect(existsSync(`${files}.restoring`)).toBe(false);
	});
});
