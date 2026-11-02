import { ORPCError } from "@orpc/server";
import { setCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { SQL } from "bun";
import * as v from "valibot";
import { useSecureCookies } from "../../lib/cookies";
import { isFirstRun, isSignupOpen, makeFirstAdmin } from "../../lib/instance";
import { findUsableInvite } from "../../lib/invites";
import { enforceRateLimit, RateLimiter } from "../../lib/rate-limit";
import { base } from "../../orpc";

const auth = new Auth();

const signUpsByIp = new RateLimiter(10, 60 * 60 * 1000);

const Params = v.object({
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
	fullName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
	displayName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
	password: v.pipe(v.string(), v.minLength(10), v.maxLength(64)),
	inviteToken: v.optional(v.string()),
});

export const signUp = base.input(Params).handler(async ({ input, context }) => {
	enforceRateLimit(signUpsByIp, context.ip);

	const firstRun = await isFirstRun();
	const allowed =
		firstRun ||
		(await isSignupOpen()) ||
		(input.inviteToken !== undefined &&
			(await findUsableInvite(input.inviteToken)) !== undefined);
	if (!allowed) {
		throw new ORPCError("FORBIDDEN", {
			message: "Sign-ups are closed. Ask an admin for an invite link.",
		});
	}

	try {
		const { session, user } = await auth.signUp(
			input.email,
			input.fullName,
			input.displayName,
			input.password,
		);

		if (firstRun) await makeFirstAdmin(user.id);

		setCookie(context.resHeaders, "auth_session", session.authSessionToken, {
			httpOnly: true,
			secure: useSecureCookies(),
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
	} catch (error) {
		if (
			error instanceof SQL.SQLiteError &&
			error.code === "SQLITE_CONSTRAINT_UNIQUE"
		) {
			if (error.message.includes("auth_user.displayName")) {
				throw new ORPCError("CONFLICT", {
					message: "That display name is already taken",
				});
			}

			throw new ORPCError("CONFLICT", {
				message: "Email already registered",
			});
		}
		throw error;
	}
});
