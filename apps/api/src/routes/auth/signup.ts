import { ORPCError } from "@orpc/server";
import { setCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import { SQL } from "bun";
import * as v from "valibot";
import { base } from "../../orpc";

const auth = new Auth();

const Params = v.object({
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
	fullName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
	displayName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
	password: v.pipe(v.string(), v.minLength(10), v.maxLength(64)),
});

export const signUp = base.input(Params).handler(async ({ input, context }) => {
	try {
		const { session, user } = await auth.signUp(
			input.email,
			input.fullName,
			input.displayName,
			input.password,
		);

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
	} catch (error) {
		if (
			error instanceof SQL.SQLiteError &&
			error.code === "SQLITE_CONSTRAINT_UNIQUE"
		) {
			if (error.message.includes("auth_user.displayName")) {
				throw new ORPCError("CONFLICT", {
					message: "That display name is already taken",
					data: { field: "displayName" },
				});
			}

			throw new ORPCError("CONFLICT", {
				message: "Email already registered",
				data: { field: "email" },
			});
		}
		throw error;
	}
});
