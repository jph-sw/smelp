import { ORPCError } from "@orpc/server";
import { Auth } from "@smelp/auth";
import { DB, type tables, Utils } from "@smelp/db";
import * as v from "valibot";
import { requireSession } from "../../lib/access";
import { isMailEnabled, sendPasswordResetEmail } from "../../lib/mail";
import {
	createPasswordResetLink,
	findUsablePasswordReset,
} from "../../lib/password-reset";
import { enforceRateLimit, RateLimiter } from "../../lib/rate-limit";
import { hashSecretToken } from "../../lib/tokens";
import { base } from "../../orpc";
import { clearSignInAttempts } from "./signin";

const sql = new DB().sqlite;
const auth = new Auth();
const utils = new Utils();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const resetsByIp = new RateLimiter(20, FIFTEEN_MINUTES);
const changesByUser = new RateLimiter(10, FIFTEEN_MINUTES);

const ONE_HOUR = 60 * 60 * 1000;
const resetRequestsByIp = new RateLimiter(10, FIFTEEN_MINUTES);
// Stops someone flooding another person's inbox, or repeatedly cancelling their
// unused link, since each new link replaces the last.
const resetRequestsByEmail = new RateLimiter(3, ONE_HOUR);

const NewPassword = v.pipe(v.string(), v.minLength(10), v.maxLength(64));

const invalidLink = () =>
	new ORPCError("NOT_FOUND", {
		message: "This reset link is invalid or has expired.",
	});

async function emailResetLink(email: string) {
	const user = (
		await sql`SELECT id FROM auth_user WHERE email = ${email}`
	)[0] as Pick<tables["auth_user"], "id"> | undefined;
	if (!user) return;

	const { token } = await createPasswordResetLink(user.id, null);
	await sendPasswordResetEmail({ to: email, token });
}

// Public. The answer and its timing are the same whether or not the account exists,
// so the work happens after responding and this can't be used to find accounts.
export const requestPasswordReset = base
	.input(
		v.object({
			email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!isMailEnabled()) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Email isn't set up on this server. Ask your instance admin.",
			});
		}
		enforceRateLimit(resetRequestsByIp, context.ip);

		if (resetRequestsByEmail.consume(input.email).allowed) {
			emailResetLink(input.email).catch((error) => {
				utils.logger.error(`Couldn't start a password reset: ${error}`);
			});
		}

		return { success: true };
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

			const updated = await tx`
				UPDATE auth_account SET password = ${passwordHash}, updatedAt = ${now}
				WHERE userId = ${reset.userId} AND providerId = 'password'
				RETURNING id
			`;
			// Someone who has only signed in through a provider has no password row.
			if (updated.length === 0) {
				await tx`INSERT INTO auth_account ${tx({
					id: auth.generateRandomId(),
					userId: reset.userId,
					accountId: auth.generateRandomId(),
					providerId: "password",
					password: passwordHash,
					createdAt: now,
					updatedAt: now,
					accessToken: null,
					refreshToken: null,
					accessTokenExpiresAt: null,
					refreshTokenExpiresAt: null,
					scope: null,
					idToken: null,
				})}`;
			}
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
