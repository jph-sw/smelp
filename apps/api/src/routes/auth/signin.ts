import { ORPCError } from "@orpc/server";
import { setCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import * as v from "valibot";
import { enforceRateLimit, RateLimiter } from "../../lib/rate-limit";
import { base } from "../../orpc";

const auth = new Auth();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const attemptsByAccount = new RateLimiter(10, FIFTEEN_MINUTES);
const attemptsByIp = new RateLimiter(50, FIFTEEN_MINUTES);

const accountKeyFor = (ip: string, email: string) =>
	`${ip}:${email.toLowerCase()}`;

// A fresh password shouldn't stay locked out by failed attempts with the old one.
export function clearSignInAttempts(ip: string, email: string) {
	attemptsByAccount.reset(accountKeyFor(ip, email));
}

const Params = v.object({
	email: v.pipe(v.string(), v.email()),
	password: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

export const signIn = base.input(Params).handler(async ({ input, context }) => {
	// Scoped to the IP as well, so nobody can lock another person out by email alone.
	const accountKey = accountKeyFor(context.ip, input.email);
	enforceRateLimit(attemptsByAccount, accountKey);
	enforceRateLimit(attemptsByIp, context.ip);

	const result = await auth.signIn(input.email, input.password);

	if (result == null) {
		throw new ORPCError("UNAUTHORIZED", { message: "Invalid credentials" });
	}

	attemptsByAccount.reset(accountKey);

	const { session, user } = result;

	setCookie(context.resHeaders, "auth_session", session.authSessionToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: auth.authSessionExpiresInSeconds,
	});

	return {
		user: {
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			displayName: user.displayName,
		},
	};
});
