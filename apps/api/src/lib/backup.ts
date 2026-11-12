import { Database } from "bun:sqlite";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

// A user-facing failure: its message says what to do, so no stack trace is needed.
export class BackupError extends Error {}

const stamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, "-");

export const backupsDirectory = (databasePath: string) =>
	path.join(path.dirname(path.resolve(databasePath)), "backups");

function open(file: string, options?: { readonly?: boolean }) {
	const db = new Database(file, options);
	db.run("PRAGMA busy_timeout = 10000");
	return db;
}

// Files are kept in a folder beside the backup, named after it, so a backup made
// before attachments existed is still just the one database file.
export const attachmentsOf = (backupFile: string) =>
	`${backupFile}.attachments`;

// A backup that predates attachments has no such table.
function attachmentKeysIn(file: string) {
	const db = open(file, { readonly: true });
	try {
		return (
			db.query("SELECT storageKey FROM attachment").all() as {
				storageKey: string;
			}[]
		).map((row) => row.storageKey);
	} catch {
		return [];
	} finally {
		db.close();
	}
}

function copyAttachments(keys: string[], from: string, to: string) {
	rmSync(to, { recursive: true, force: true });
	mkdirSync(to, { recursive: true, mode: 0o700 });
	let copied = 0;
	for (const key of keys) {
		// Keys are generated names, but this folder is also read back from a backup.
		if (path.basename(key) !== key) continue;
		const source = path.join(from, key);
		// Deleted since the database was copied, so nothing refers to it any more.
		if (!existsSync(source)) continue;
		copyFileSync(source, path.join(to, key));
		chmodSync(path.join(to, key), 0o600);
		copied += 1;
	}
	return copied;
}

function checkIntegrity(file: string) {
	let db: Database | undefined;
	try {
		db = open(file, { readonly: true });
		const result = db.query("PRAGMA integrity_check").get() as {
			integrity_check: string;
		};
		return result.integrity_check === "ok";
	} catch {
		return false;
	} finally {
		db?.close();
	}
}

// Safe while smelp is running: VACUUM INTO reads one consistent view of the database,
// which copying the file wouldn't. A finished backup always has its final name, so a
// partial one can't be mistaken for it.
export function createBackup(
	databasePath: string,
	destination?: string,
	attachmentsDirectory?: string,
) {
	if (!existsSync(databasePath)) {
		throw new BackupError(`No database found at ${databasePath}`);
	}

	const directory = backupsDirectory(databasePath);
	const target = path.resolve(
		destination ?? path.join(directory, `smelp-${stamp()}.sqlite`),
	);
	if (existsSync(target)) {
		throw new BackupError(`${target} already exists`);
	}

	// Backups hold password hashes, so only this user can read them.
	mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
	const partial = `${target}.partial`;
	rmSync(partial, { force: true });

	const db = open(databasePath, { readonly: true });
	try {
		db.run("VACUUM INTO ?", [partial]);
	} finally {
		db.close();
	}
	chmodSync(partial, 0o600);

	if (!checkIntegrity(partial)) {
		rmSync(partial, { force: true });
		throw new BackupError(
			"The backup failed its integrity check, so it wasn't kept. Your database may be damaged.",
		);
	}

	// Only files the copied database refers to are taken, so the two always agree
	// even if someone attaches a file while this runs. The database gets its final
	// name last, because that is what marks a backup as complete.
	let attachments = 0;
	if (attachmentsDirectory) {
		const keys = attachmentKeysIn(partial);
		if (keys.length > 0) {
			const folder = attachmentsOf(target);
			const partialFolder = `${folder}.partial`;
			attachments = copyAttachments(keys, attachmentsDirectory, partialFolder);
			rmSync(folder, { recursive: true, force: true });
			renameSync(partialFolder, folder);
		}
	}
	renameSync(partial, target);

	return { file: target, bytes: statSync(target).size, attachments };
}

function migrationsIn(file: string) {
	const db = open(file, { readonly: true });
	try {
		const rows = db.query("SELECT name FROM schema_migrations").all() as {
			name: string;
		}[];
		return rows.map((row) => row.name);
	} catch {
		return null;
	} finally {
		db.close();
	}
}

export function checkBackup(file: string, migrationsDirectory: string) {
	if (!existsSync(file)) throw new BackupError(`${file} doesn't exist`);
	if (!checkIntegrity(file)) {
		throw new BackupError(`${file} isn't a healthy SQLite database`);
	}

	const applied = migrationsIn(file);
	if (!applied) throw new BackupError(`${file} isn't a smelp backup`);

	// An older backup is fine, because migrations bring it up to date on the next start.
	const known = new Set(readdirSync(migrationsDirectory));
	const unknown = applied.filter((name) => !known.has(name));
	if (unknown.length > 0) {
		throw new BackupError(
			`${file} came from a newer version of smelp. Upgrade smelp first, then restore it.`,
		);
	}
}

const SIDECAR_SUFFIXES = ["-journal", "-wal", "-shm"];

// The current database is set aside rather than deleted, even when it's damaged,
// which is often the reason for restoring.
export function restoreBackup(
	databasePath: string,
	file: string,
	migrationsDirectory: string,
	attachmentsDirectory?: string,
) {
	checkBackup(file, migrationsDirectory);
	if (isServerRunning(databasePath)) {
		throw new BackupError(
			"smelp is still running, or crashed in the last 30 seconds. Stop it and try again, because a running server would keep using the old database.",
		);
	}

	const target = path.resolve(databasePath);
	if (path.resolve(file) === target) {
		throw new BackupError("That file is the current database");
	}

	// Copied in full before anything moves, so a failure leaves everything as it was.
	const incoming = `${target}.restoring`;
	const source = open(file, { readonly: true });
	try {
		rmSync(incoming, { force: true });
		source.run("VACUUM INTO ?", [incoming]);
	} finally {
		source.close();
	}
	chmodSync(incoming, 0o600);

	// Also copied before anything moves. A backup from before attachments existed has
	// no folder, and leaves the current one alone.
	const backedUpFiles = attachmentsOf(path.resolve(file));
	const restoresFiles =
		attachmentsDirectory !== undefined && existsSync(backedUpFiles);
	const incomingFiles = attachmentsDirectory
		? `${path.resolve(attachmentsDirectory)}.restoring`
		: "";
	if (restoresFiles) {
		copyAttachments(readdirSync(backedUpFiles), backedUpFiles, incomingFiles);
	}
	const attachmentsMissing =
		!restoresFiles && attachmentKeysIn(file).length > 0;

	let setAside: string | null = null;
	if (existsSync(target)) {
		const directory = backupsDirectory(target);
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		setAside = path.join(directory, `before-restore-${stamp()}.sqlite`);
		renameSync(target, setAside);
		for (const suffix of SIDECAR_SUFFIXES) {
			if (existsSync(target + suffix)) {
				renameSync(target + suffix, setAside + suffix);
			}
		}
	}
	renameSync(incoming, target);

	let attachmentsSetAside: string | null = null;
	if (restoresFiles && attachmentsDirectory) {
		const current = path.resolve(attachmentsDirectory);
		if (existsSync(current)) {
			attachmentsSetAside = `${current}.before-restore-${stamp()}`;
			renameSync(current, attachmentsSetAside);
		}
		renameSync(incomingFiles, current);
	}

	return { setAside, attachmentsSetAside, attachmentsMissing };
}

// A running server keeps this file's time fresh. It's a file rather than a process
// check because a restore runs in a different container from the server.
const RUNNING_INTERVAL_MS = 10_000;
const RUNNING_EXPIRES_MS = 30_000;
const runningMarker = (databasePath: string) =>
	`${path.resolve(databasePath)}.running`;

export function isServerRunning(databasePath: string, now = Date.now()) {
	const marker = runningMarker(databasePath);
	if (!existsSync(marker)) return false;
	return now - statSync(marker).mtimeMs < RUNNING_EXPIRES_MS;
}

export function markServerRunning(databasePath: string) {
	const marker = runningMarker(databasePath);
	writeFileSync(marker, "");
	const timer = setInterval(() => {
		const now = new Date();
		try {
			utimesSync(marker, now, now);
		} catch {
			writeFileSync(marker, "");
		}
	}, RUNNING_INTERVAL_MS);
	timer.unref();

	return () => {
		clearInterval(timer);
		rmSync(marker, { force: true });
	};
}
