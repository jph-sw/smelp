import { DB, type InstanceRole } from "@smelp/db";

const sql = new DB().sqlite;

export async function isFirstRun() {
	const { count } = (await sql`SELECT COUNT(*) AS count FROM auth_user`)[0] as {
		count: number;
	};
	return count === 0;
}

export const SIGNUP_MODES = ["closed", "open", "guest"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export async function getSignupMode(): Promise<SignupMode> {
	const setting = (
		await sql`SELECT value FROM instance_setting WHERE key = 'signup'`
	)[0] as { value: string } | undefined;
	return SIGNUP_MODES.find((mode) => mode === setting?.value) ?? "closed";
}

export async function setSignupMode(mode: SignupMode) {
	await sql`
		INSERT INTO instance_setting (key, value) VALUES ('signup', ${mode})
		ON CONFLICT (key) DO UPDATE SET value = excluded.value
	`;
}

// An invite vouches for the person, so only a public sign-up in guest mode makes
// a guest.
export function signupAccess({
	firstRun,
	mode,
	hasInvite,
}: {
	firstRun: boolean;
	mode: SignupMode;
	hasInvite: boolean;
}):
	| { allowed: false }
	| { allowed: true; role: InstanceRole; public: boolean } {
	if (firstRun || hasInvite)
		return { allowed: true, role: "user", public: false };
	if (mode === "closed") return { allowed: false };
	return {
		allowed: true,
		role: mode === "guest" ? "guest" : "user",
		public: true,
	};
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
