import { DB, type tables } from "@smelp/db";
import { createSecretToken, hashSecretToken } from "./tokens";

const sql = new DB().sqlite;

const RESET_LIFETIME_MS = 24 * 60 * 60 * 1000;

// A new link replaces any earlier unused one, so only the latest link works.
export async function createPasswordResetLink(
	userId: string,
	createdByUserId: string | null,
) {
	const token = createSecretToken();
	const now = Date.now();
	const reset: tables["auth_password_reset"] = {
		id: crypto.randomUUID(),
		userId,
		tokenHash: hashSecretToken(token),
		createdByUserId,
		createdAt: now,
		expiresAt: now + RESET_LIFETIME_MS,
		usedAt: null,
	};

	await sql.begin(async (tx) => {
		await tx`DELETE FROM auth_password_reset WHERE userId = ${userId} AND usedAt IS NULL`;
		await tx`INSERT INTO auth_password_reset ${tx(reset)}`;
	});

	return { token, expiresAt: reset.expiresAt };
}

export async function findUsablePasswordReset(token: string) {
	const tokenHash = hashSecretToken(token);
	return (
		await sql`
			SELECT auth_password_reset.*, auth_user.email
			FROM auth_password_reset
			JOIN auth_user ON auth_user.id = auth_password_reset.userId
			WHERE auth_password_reset.tokenHash = ${tokenHash}
				AND auth_password_reset.usedAt IS NULL
				AND auth_password_reset.expiresAt > ${Date.now()}
		`
	)[0] as (tables["auth_password_reset"] & { email: string }) | undefined;
}
