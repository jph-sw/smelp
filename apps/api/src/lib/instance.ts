import { DB } from "@smelp/db";

const sql = new DB().sqlite;

export async function isFirstRun() {
	const { count } = (await sql`SELECT COUNT(*) AS count FROM auth_user`)[0] as {
		count: number;
	};
	return count === 0;
}

export async function isSignupOpen() {
	const setting = (
		await sql`SELECT value FROM instance_setting WHERE key = 'signupOpen'`
	)[0] as { value: string } | undefined;
	return setting?.value === "true";
}

export async function setSignupOpen(open: boolean) {
	await sql`UPDATE instance_setting SET value = ${String(open)} WHERE key = 'signupOpen'`;
}

// The check inside the UPDATE means only one account can win if two people finish
// the first sign-up at the same moment.
export async function makeFirstAdmin(userId: string) {
	await sql`
		UPDATE auth_user SET role = 'admin'
		WHERE id = ${userId}
			AND NOT EXISTS (SELECT 1 FROM auth_user WHERE role = 'admin')
	`;
}
