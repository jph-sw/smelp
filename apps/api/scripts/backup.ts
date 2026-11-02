// Safe to run while smelp is running: bun run backup [file]
import { databasePath } from "@smelp/db";
import { BackupError, createBackup } from "../src/lib/backup";

try {
	const { file, bytes } = createBackup(databasePath(), process.argv[2]);
	console.log(`Backup saved: ${file} (${(bytes / 1024).toFixed(0)} KB)`);
} catch (error) {
	if (!(error instanceof BackupError)) throw error;
	console.error(error.message);
	process.exit(1);
}
