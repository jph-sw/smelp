import { ORPCError } from "@orpc/server";
import { DB, type tables } from "@smelp/db";
import { isMailEnabled, sendEmailVerificationEmail } from "./mail";
import { createSecretToken, hashSecretToken } from "./tokens";

const sql = new DB().sqlite;

const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

// A new link replaces any earlier unused one, so only the latest link works.
export async function createEmailVerificationLink(
	userId: string,
	email: string,
) {
	const token = createSecretToken();
	const now = Date.now();
	const verification: tables["auth_email_verification"] = {
		id: crypto.randomUUID(),
		userId,
		email,
		tokenHash: hashSecretToken(token),
		createdAt: now,
		expiresAt: now + VERIFICATION_LIFETIME_MS,
		usedAt: null,
	};

	await sql.begin(async (tx) => {
		await tx`DELETE FROM auth_email_verification WHERE userId = ${userId} AND usedAt IS NULL`;
		await tx`INSERT INTO auth_email_verification ${tx(verification)}`;
	});

	return { token, expiresAt: verification.expiresAt };
}

// Callers run this after responding, so a slow mail server never holds up a
// request and a failure only reaches the log.
export async function emailVerificationLink(userId: string, email: string) {
	const { token } = await createEmailVerificationLink(userId, email);
	await sendEmailVerificationEmail({ to: email, token });
}

// Marks the address as confirmed. Claiming the link and the write happen in one
// transaction, so a link works once even if it's opened twice at the same moment,
// and only for the address it was sent to.
export async function consumeEmailVerification(token: string) {
	const tokenHash = hashSecretToken(token);
	const now = Date.now();

	return sql.begin(async (tx) => {
		const claimed = (await tx`
			UPDATE auth_email_verification SET usedAt = ${now}
			WHERE tokenHash = ${tokenHash} AND usedAt IS NULL AND expiresAt > ${now}
			RETURNING userId, email
		`) as Pick<tables["auth_email_verification"], "userId" | "email">[];
		const link = claimed[0];
		if (!link) return false;

		// Matching the address means a link for an old address does nothing.
		const verified = await tx`
			UPDATE auth_user SET emailVerified = 1, updatedAt = ${now}
			WHERE id = ${link.userId} AND email = ${link.email}
			RETURNING id
		`;
		return verified.length > 0;
	});
}

// The gate follows whether email can deliver the link right now, not how the
// account was made, so closing sign-up later does not free anyone unverified.
// Unverified accounts can sign in and join workspaces, but not start their own.
// Only applies while email can deliver the link; an admin can also mark someone
// verified by hand.
export async function requireVerifiedEmail(userId: string) {
	if (!isMailEnabled()) return;
	const user = (
		await sql`SELECT emailVerified FROM auth_user WHERE id = ${userId}`
	)[0] as Pick<tables["auth_user"], "emailVerified"> | undefined;
	if (user && user.emailVerified !== 1) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"Confirm your email address first. Check your inbox for the link.",
		});
	}
}

export async function markEmailVerified(userId: string) {
	const now = Date.now();
	return sql.begin(async (tx) => {
		const updated = await tx`
			UPDATE auth_user SET emailVerified = 1, updatedAt = ${now}
			WHERE id = ${userId}
			RETURNING id
		`;
		await tx`DELETE FROM auth_email_verification WHERE userId = ${userId} AND usedAt IS NULL`;
		return updated.length > 0;
	});
}
