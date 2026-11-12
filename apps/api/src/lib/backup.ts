import { Database } from "bun:sqlite";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	linkSync,
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

// Attachment files are named by a generated key. This is also checked on what's read
// back from a backup, so nothing else is ever copied or used as a path.
export const STORAGE_KEY =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Files are never changed once written, so a backup can share them with the live
// folder through a hard link, which costs no space. Restores copy instead.
function copyAttachments(
	keys: string[],
	from: string,
	to: string,
	options: { link: boolean },
) {
	rmSync(to, { recursive: true, force: true });
	mkdirSync(to, { recursive: true, mode: 0o700 });
	let copied = 0;
	let missing = 0;
	for (const key of keys) {
		if (!STORAGE_KEY.test(key)) continue;
		const source = path.join(from, key);
		const destination = path.join(to, key);
		// Deleted since the database was copied, so nothing refers to it any more.
		if (!existsSync(source)) {
			missing += 1;
			continue;
		}
		let linked = false;
		if (options.link) {
			try {
				linkSync(source, destination);
				linked = true;
			} catch {
				// Another filesystem, or one that doesn't allow links.
			}
		}
		if (!linked) {
			copyFileSync(source, destination);
			chmodSync(destination, 0o600);
		}
		copied += 1;
	}
	return { copied, missing };
}

// Only plain files named like attachments; anything else in the folder is not ours.
function attachmentFilesIn(directory: string) {
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && STORAGE_KEY.test(entry.name))
		.map((entry) => entry.name);
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
	let attachmentsMissing = 0;
	if (attachmentsDirectory) {
		const keys = attachmentKeysIn(partial);
		if (keys.length > 0) {
			const folder = attachmentsOf(target);
			const partialFolder = `${folder}.partial`;
			const result = copyAttachments(
				keys,
				attachmentsDirectory,
				partialFolder,
				{
					link: true,
				},
			);
			attachments = result.copied;
			attachmentsMissing = result.missing;
			rmSync(folder, { recursive: true, force: true });
			renameSync(partialFolder, folder);
		}
	}
	renameSync(partial, target);

	return {
		file: target,
		bytes: statSync(target).size,
		attachments,
		attachmentsMissing,
	};
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
	// For tests to make a failure happen at a chosen moment.
	hooks?: { afterDatabaseSwap?: () => void },
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
	// no folder, and leaves the current one alone. The copy is staged inside the
	// attachments folder, and the old files are set aside in it too, so everything
	// moves within one filesystem even when the folder is a mount point of its own.
	const backedUpFiles = attachmentsOf(path.resolve(file));
	const restoresFiles =
		attachmentsDirectory !== undefined && existsSync(backedUpFiles);
	const files = attachmentsDirectory ? path.resolve(attachmentsDirectory) : "";
	const incomingFiles = path.join(files, ".restoring");
	if (restoresFiles) {
		mkdirSync(files, { recursive: true, mode: 0o700 });
		copyAttachments(
			attachmentFilesIn(backedUpFiles),
			backedUpFiles,
			incomingFiles,
			{ link: false },
		);
	}
	const attachmentsMissing =
		!restoresFiles && attachmentKeysIn(file).length > 0;

	// Every step that has happened can be undone, because a restore that stops halfway
	// would leave a database and its files from different times.
	const undo: (() => void)[] = [];
	let setAside: string | null = null;
	let attachmentsSetAside: string | null = null;
	try {
		if (existsSync(target)) {
			const directory = backupsDirectory(target);
			mkdirSync(directory, { recursive: true, mode: 0o700 });
			const aside = path.join(directory, `before-restore-${stamp()}.sqlite`);
			renameSync(target, aside);
			undo.push(() => renameSync(aside, target));
			for (const suffix of SIDECAR_SUFFIXES) {
				if (existsSync(target + suffix)) {
					renameSync(target + suffix, aside + suffix);
					undo.push(() => renameSync(aside + suffix, target + suffix));
				}
			}
			setAside = aside;
		}
		renameSync(incoming, target);
		undo.push(() => renameSync(target, incoming));
		hooks?.afterDatabaseSwap?.();

		if (restoresFiles) {
			const old = attachmentFilesIn(files);
			if (old.length > 0) {
				const aside = path.join(files, `.before-restore-${stamp()}`);
				mkdirSync(aside, { mode: 0o700 });
				undo.push(() => rmSync(aside, { recursive: true, force: true }));
				for (const name of old) {
					renameSync(path.join(files, name), path.join(aside, name));
					undo.push(() =>
						renameSync(path.join(aside, name), path.join(files, name)),
					);
				}
				attachmentsSetAside = aside;
			}
			for (const name of attachmentFilesIn(incomingFiles)) {
				renameSync(path.join(incomingFiles, name), path.join(files, name));
				undo.push(() =>
					renameSync(path.join(files, name), path.join(incomingFiles, name)),
				);
			}
			rmSync(incomingFiles, { recursive: true, force: true });
		}
	} catch (error) {
		for (const step of undo.reverse()) {
			try {
				step();
			} catch {
				// Keep undoing the rest.
			}
		}
		rmSync(incoming, { force: true });
		if (restoresFiles) rmSync(incomingFiles, { recursive: true, force: true });
		const reason = error instanceof Error ? error.message : String(error);
		throw new BackupError(
			`The restore failed (${reason}) and was undone, so your database and attachments are as they were.`,
		);
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
