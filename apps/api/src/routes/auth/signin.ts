import { Auth } from "@smelp/auth";
import type { BunRequest } from "bun";
import * as v from "valibot";

const Params = v.object({
	email: v.pipe(v.string(), v.email()),
	password: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

export async function SignInHandler(req: BunRequest) {
	const auth = new Auth();
	const json = await req.json();
	const params = v.safeParse(Params, json);

	if (!params.success) {
		return Response.json(params.issues);
	}

	const result = await auth.signIn(params.output.email, params.output.password);

	if (result == null) {
		return Response.json({ error: "invalid credentials" }, { status: 401 });
	}

	const { session, user } = result;

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
			headers: {
				"Set-Cookie": `auth_session=${session.authSessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${auth.authSessionExpiresInSeconds}`,
			},
		},
	);
}
