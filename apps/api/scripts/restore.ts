// Stop smelp first, then: bun run restore <file>
import { databasePath } from "@smelp/db";
import { BackupError, restoreBackup } from "../src/lib/backup";

const file = process.argv[2];
if (!file) {
	console.error("usage: bun run restore <file>");
	process.exit(1);
}

try {
	const { setAside } = restoreBackup(databasePath(), file, "./migrations");
	console.log(`Restored ${file}. Start smelp again to use it.`);
	if (setAside) console.log(`The previous database was kept at ${setAside}`);
} catch (error) {
	if (!(error instanceof BackupError)) throw error;
	console.error(error.message);
	process.exit(1);
}
