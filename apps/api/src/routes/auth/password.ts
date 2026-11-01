import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB } from "@smelp/db";
import * as v from "valibot";
import { requireSession } from "../../lib/access";
import { findUsablePasswordReset } from "../../lib/password-reset";
import { enforceRateLimit, RateLimiter } from "../../lib/rate-limit";
import { hashSecretToken } from "../../lib/tokens";
import { base } from "../../orpc";
import { clearSignInAttempts } from "./signin";

const sql = new DB().sqlite;
const auth = new Auth();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const resetsByIp = new RateLimiter(20, FIFTEEN_MINUTES);
const changesByUser = new RateLimiter(10, FIFTEEN_MINUTES);

const NewPassword = v.pipe(v.string(), v.minLength(10), v.maxLength(64));

const invalidLink = () =>
	new ORPCError("NOT_FOUND", {
		message: "This reset link is invalid or has expired.",
	});

// Public: holding the link is the proof. It only confirms which account it's for.
export const previewPasswordReset = base
	.input(v.object({ token: v.string() }))
	.handler(async ({ input }) => {
		const reset = await findUsablePasswordReset(input.token);
		if (!reset) throw invalidLink();
		return { email: reset.email };
	});

export const resetPassword = base
	.input(v.object({ token: v.string(), newPassword: NewPassword }))
	.handler(async ({ input, context }) => {
		enforceRateLimit(resetsByIp, context.ip);

		const reset = await findUsablePasswordReset(input.token);
		if (!reset) throw invalidLink();

		const passwordHash = await auth.hashPassword(input.newPassword);
		const now = Date.now();
		const tokenHash = hashSecretToken(input.token);

		await sql.begin(async (tx) => {
			// Claims the link first, so it can only ever be used once.
			const claimed = await tx`
				UPDATE auth_password_reset SET usedAt = ${now}
				WHERE tokenHash = ${tokenHash} AND usedAt IS NULL AND expiresAt > ${now}
				RETURNING id
			`;
			if (claimed.length === 0) throw invalidLink();

			await tx`
				UPDATE auth_account SET password = ${passwordHash}, updatedAt = ${now}
				WHERE userId = ${reset.userId} AND providerId = 'password'
			`;
			// Anyone who was signed in as this person is signed out.
			await tx`DELETE FROM auth_session WHERE userId = ${reset.userId}`;
		});

		clearSignInAttempts(context.ip, reset.email);

		return { success: true };
	});

export const changePassword = base
	.input(
		v.object({
			currentPassword: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
			newPassword: NewPassword,
		}),
	)
	.handler(async ({ input, context }) => {
		const session = await requireSession(context.headers);
		enforceRateLimit(changesByUser, session.userId);

		const isCorrect = await auth.verifyPassword(
			session.userId,
			input.currentPassword,
		);
		if (!isCorrect) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Your current password is incorrect.",
			});
		}
		if (input.newPassword === input.currentPassword) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Choose a password you aren't already using.",
			});
		}

		changesByUser.reset(session.userId);

		const passwordHash = await auth.hashPassword(input.newPassword);
		const now = Date.now();

		await sql.begin(async (tx) => {
			await tx`
				UPDATE auth_account SET password = ${passwordHash}, updatedAt = ${now}
				WHERE userId = ${session.userId} AND providerId = 'password'
			`;
			// Other devices are signed out; this one stays signed in.
			await tx`DELETE FROM auth_session WHERE userId = ${session.userId} AND id != ${session.id}`;
			await tx`DELETE FROM auth_password_reset WHERE userId = ${session.userId} AND usedAt IS NULL`;
		});

		return { success: true };
	});
