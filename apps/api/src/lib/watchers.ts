import { DB } from "@smelp/db";

const sql = new DB().sqlite;

type Query = (
	strings: TemplateStringsArray,
	...values: unknown[]
) => PromiseLike<unknown>;

/** Makes each person a watcher of the item. Someone already watching stays as they were. */
export async function watch(
	issueId: string,
	userIds: (string | null)[],
	db: Query = sql,
) {
	const now = Date.now();
	for (const userId of new Set(userIds)) {
		if (userId === null) continue;
		await db`
			INSERT OR IGNORE INTO issue_watcher (issueId, userId, createdAt)
			VALUES (${issueId}, ${userId}, ${now})
		`;
	}
}

export async function unwatch(issueId: string, userId: string) {
	await sql`DELETE FROM issue_watcher WHERE issueId = ${issueId} AND userId = ${userId}`;
}

export async function watcherIds(issueId: string) {
	const rows = (await sql`
		SELECT userId FROM issue_watcher WHERE issueId = ${issueId}
	`) as { userId: string }[];
	return rows.map((row) => row.userId);
}
