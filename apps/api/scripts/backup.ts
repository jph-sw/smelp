// Safe to run while smelp is running: bun run backup [file]
import { databasePath } from "@smelp/db";
import { attachmentsPath } from "../src/lib/attachments";
import { BackupError, createBackup } from "../src/lib/backup";

try {
	const { file, bytes, attachments, attachmentsMissing } = createBackup(
		databasePath(),
		process.argv[2],
		attachmentsPath(),
	);
	console.log(`Backup saved: ${file} (${(bytes / 1024).toFixed(0)} KB)`);
	if (attachments > 0) {
		console.log(`${attachments} attachment(s) saved in ${file}.attachments`);
	}
	if (attachmentsMissing > 0) {
		console.log(
			`${attachmentsMissing} attachment file(s) were missing on disk and weren't included.`,
		);
	}
} catch (error) {
	if (!(error instanceof BackupError)) throw error;
	console.error(error.message);
	process.exit(1);
}
