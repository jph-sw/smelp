import { DB, type tables } from "@smelp/db";
import { hashSecretToken } from "./tokens";

const sql = new DB().sqlite;

export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export async function findUsableInvite(token: string) {
	const tokenHash = hashSecretToken(token);
	return (
		await sql`
			SELECT * FROM auth_space_invite
			WHERE tokenHash = ${tokenHash}
				AND acceptedAt IS NULL
				AND expiresAt > ${Date.now()}
		`
	)[0] as tables["auth_space_invite"] | undefined;
}
