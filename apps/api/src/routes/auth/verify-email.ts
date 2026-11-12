import { ORPCError } from "@orpc/server";
import { DB, type tables, Utils } from "@smelp/db";
import * as v from "valibot";
import { requireSession } from "../../lib/access";
import {
	consumeEmailVerification,
	emailVerificationLink,
} from "../../lib/email-verification";
import { isMailEnabled } from "../../lib/mail";
import { enforceRateLimit, RateLimiter } from "../../lib/rate-limit";
import { base } from "../../orpc";

const sql = new DB().sqlite;
const utils = new Utils();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const verifiesByIp = new RateLimiter(20, FIFTEEN_MINUTES);
// Two limits, so one account can't flood an inbox and one address can't be
// flooded through several accounts.
const resendsByUser = new RateLimiter(3, ONE_HOUR);
const resendsByEmail = new RateLimiter(5, ONE_HOUR);

// Public: holding the link is the proof.
export const verifyEmail = base
	.input(v.object({ token: v.pipe(v.string(), v.maxLength(200)) }))
	.handler(async ({ input, context }) => {
		enforceRateLimit(verifiesByIp, context.ip);

		if (!(await consumeEmailVerification(input.token))) {
			throw new ORPCError("NOT_FOUND", {
				message: "This link is invalid or has expired.",
			});
		}
		return { success: true };
	});

// Only ever about the signed-in person's own account, so the answer can say whether
// it sent anything without revealing which addresses have accounts.
export const resendEmailVerification = base.handler(async ({ context }) => {
	const session = await requireSession(context.headers);

	const user = (
		await sql`SELECT email, emailVerified FROM auth_user WHERE id = ${session.userId}`
	)[0] as Pick<tables["auth_user"], "email" | "emailVerified"> | undefined;
	if (!user) throw new ORPCError("UNAUTHORIZED");

	if (user.emailVerified === 1 || !isMailEnabled()) {
		return { success: true, sent: false };
	}

	enforceRateLimit(resendsByUser, session.userId);
	enforceRateLimit(resendsByEmail, user.email);

	emailVerificationLink(session.userId, user.email).catch((error) => {
		utils.logger.error(`Couldn't send a verification email: ${error}`);
	});
	return { success: true, sent: true };
});
