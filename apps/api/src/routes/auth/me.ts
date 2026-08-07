import { Auth } from "@smelp/auth";
import { DB, type tables } from "@smelp/db";
import type { BunRequest } from "bun";

export async function MeHandler(req: BunRequest) {
	const token = req.cookies.get("auth_session");
	if (token == null) {
		return Response.json({ error: "not signed in" }, { status: 401 });
	}

	const auth = new Auth();
	const session = await auth.validateAuthSessionToken(token);
	if (session == null) {
		return Response.json({ error: "not signed in" }, { status: 401 });
	}

	const sql = new DB().sqlite;
	const users =
		(await sql`SELECT * FROM auth_user WHERE id = ${session.userId}`) as tables["auth_user"][];
	const user = users[0];
	if (user == null) {
		return Response.json({ error: "not signed in" }, { status: 401 });
	}

	return Response.json({ user });
}
