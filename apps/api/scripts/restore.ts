// Stop smelp first, then: bun run restore <file>
import { databasePath } from "@smelp/db";
import { attachmentsPath } from "../src/lib/attachments";
import { BackupError, restoreBackup } from "../src/lib/backup";

const file = process.argv[2];
if (!file) {
	console.error("usage: bun run restore <file>");
	process.exit(1);
}

try {
	const { setAside, attachmentsSetAside, attachmentsMissing } = restoreBackup(
		databasePath(),
		file,
		"./migrations",
		attachmentsPath(),
	);
	console.log(`Restored ${file}. Start smelp again to use it.`);
	if (setAside) console.log(`The previous database was kept at ${setAside}`);
	if (attachmentsSetAside) {
		console.log(`The previous attachments were kept at ${attachmentsSetAside}`);
	}
	if (attachmentsMissing) {
		console.log(
			`Warning: ${file}.attachments wasn't found, so files attached in that backup are missing. Put the folder next to the backup and restore again.`,
		);
	}
} catch (error) {
	if (!(error instanceof BackupError)) throw error;
	console.error(error.message);
	process.exit(1);
}
