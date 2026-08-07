import { Auth } from "@smelp/auth";
import { type } from "arktype";
import type { BunRequest } from "bun";

const Params = type({
	email: "string.email",
	password: "string >= 1 & string <= 128",
});

export async function SignInHandler(req: BunRequest) {
	const auth = new Auth();
	const json = await req.json();
	const params = Params(json);

	if (params instanceof type.errors) {
		return Response.json(params);
	}

	const result = await auth.signIn(params.email, params.password);

	if (result == null) {
		return Response.json({ error: "invalid credentials" }, { status: 401 });
	}

	const { session, user } = result;

	return Response.json(
		{ user: { id: user.id, email: user.email, name: user.name } },
		{
			headers: {
				"Set-Cookie": `auth_session=${session.authSessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${auth.authSessionExpiresInSeconds}`,
			},
		},
	);
}
