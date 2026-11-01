import { createHash } from "node:crypto";
import { DB, type tables } from "@smelp/db";

const sql = new DB().sqlite;

export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string) {
	return createHash("sha256").update(token).digest("hex");
}

export function createInviteToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Buffer.from(bytes).toString("base64url");
}

export async function findUsableInvite(token: string) {
	const tokenHash = hashInviteToken(token);
	return (
		await sql`
			SELECT * FROM auth_space_invite
			WHERE tokenHash = ${tokenHash}
				AND acceptedAt IS NULL
				AND expiresAt > ${Date.now()}
		`
	)[0] as tables["auth_space_invite"] | undefined;
}
