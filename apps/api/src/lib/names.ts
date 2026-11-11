import { DB, type tables } from "@smelp/db";

const sql = new DB().sqlite;

// Events keep the names they mention, so the activity feed still reads well after
// someone is renamed or removed.
export async function displayNameOf(userId: string | null) {
	if (!userId) return null;
	const user = (
		await sql`SELECT displayName FROM auth_user WHERE id = ${userId}`
	)[0] as Pick<tables["auth_user"], "displayName"> | undefined;
	return user?.displayName ?? null;
}
