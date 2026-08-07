import { Auth } from "@smelp/auth";
import { type } from "arktype";
import type { BunRequest } from "bun";
import { SQL } from "bun";
import { Email, Password } from "../../validators/auth";

const Params = type({
	email: Email,
	username: "string",
	password: Password,
});

export async function SignUpHandler(req: BunRequest) {
	const auth = new Auth();
	const json = await req.json();
	const params = Params(json);

	if (params instanceof type.errors) {
		return Response.json(params);
	}

	try {
		const { session, user } = await auth.signUp(
			params.email,
			params.username,
			params.password,
		);

		return Response.json(
			{ user: { id: user.id, email: user.email, name: user.name } },
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
			error.code === "SQLITE_CONSTRAINT"
		) {
			return Response.json(
				{ error: "email already registered" },
				{ status: 409 },
			);
		}
		throw error;
	}
}
