import { ORPCError } from "@orpc/server";
import { setCookie } from "@orpc/server/helpers";
import { Auth } from "@smelp/auth";
import * as v from "valibot";
import { base } from "../../orpc";

const auth = new Auth();

const Params = v.object({
	email: v.pipe(v.string(), v.email()),
	password: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

export const signIn = base.input(Params).handler(async ({ input, context }) => {
	const result = await auth.signIn(input.email, input.password);

	if (result == null) {
		throw new ORPCError("UNAUTHORIZED", { message: "Invalid credentials" });
	}

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
