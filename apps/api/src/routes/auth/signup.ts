import { Auth } from "@smelp/auth";
import type { BunRequest } from "bun";
import { SQL } from "bun";

export async function SignUpHandler(req: BunRequest) {
	const auth = new Auth();

	let body: { email?: unknown; username?: unknown; password?: unknown };
	try {
		body = (await req.json()) as typeof body;
	} catch {
		return Response.json({ error: "invalid JSON body" }, { status: 400 });
	}

	const { email, username, password } = body;
	if (
		typeof email !== "string" ||
		typeof username !== "string" ||
		typeof password !== "string"
	) {
		return Response.json(
			{ error: "email, username and password are required" },
			{ status: 400 },
		);
	}

	try {
		const { session, user } = await auth.signUp(email, username, password);

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
