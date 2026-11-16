import { DB } from "@smelp/db";

const sql = new DB().sqlite;

export async function isFirstRun() {
	const { count } = (await sql`SELECT COUNT(*) AS count FROM auth_user`)[0] as {
		count: number;
	};
	return count === 0;
}

type Flag = "signupOpen" | "publicAccess";

// Read on every call, so switching one off takes effect on the next request.
async function isOn(flag: Flag) {
	const setting = (
		await sql`SELECT value FROM instance_setting WHERE key = ${flag}`
	)[0] as { value: string } | undefined;
	return setting?.value === "true";
}

async function turn(flag: Flag, on: boolean) {
	await sql`UPDATE instance_setting SET value = ${String(on)} WHERE key = ${flag}`;
}

export const isSignupOpen = () => isOn("signupOpen");
export const setSignupOpen = (open: boolean) => turn("signupOpen", open);

/** Whether people without an account may read what workspaces have made public. */
export const isInstancePublic = () => isOn("publicAccess");
export const setInstancePublic = (open: boolean) => turn("publicAccess", open);

// The check inside the UPDATE means only one account can win if two people finish
// the first sign-up at the same moment.
export async function makeFirstAdmin(userId: string) {
	await sql`
		UPDATE auth_user SET role = 'admin'
		WHERE id = ${userId}
			AND NOT EXISTS (SELECT 1 FROM auth_user WHERE role = 'admin')
	`;
}
