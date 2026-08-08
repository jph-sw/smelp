import { Auth } from "@smelp/auth";
import type { BunRequest } from "bun";
import { SQL } from "bun";
import * as v from "valibot";

const Params = v.object({
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
	fullName: v.pipe(v.string()),
	displayName: v.pipe(v.string()),
	password: v.pipe(v.string(), v.minLength(10), v.maxLength(64)),
});

export async function SignUpHandler(req: BunRequest) {
	const auth = new Auth();
	const json = await req.json();
	const params = v.safeParse(Params, json);

	if (!params.success) {
		return Response.json(params.issues);
	}

	try {
		const { session, user } = await auth.signUp(
			params.output.email,
			params.output.fullName,
			params.output.displayName,
			params.output.password,
		);

		return Response.json(
			{
				user: {
					id: user.id,
					email: user.email,
					fullName: user.fullName,
					displayName: user.displayName,
				},
			},
			{
				status: 201,
				headers: {
					"Set-Cookie": `auth_session=${session.authSessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${auth.authSessionExpiresInSeconds}`,
				},
			},
		);
	} catch (error) {
		if (
			error instanceof SQL.SQLiteError &&
			error.code === "SQLITE_CONSTRAINT_UNIQUE"
		) {
			return Response.json(
				{ error: "Email already registered" },
				{ status: 409 },
			);
		}
		throw error;
	}
}
